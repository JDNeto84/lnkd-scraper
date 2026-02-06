import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser } from 'playwright';

const prisma = new PrismaClient();

export class ScraperService {
  private readonly DEFAULT_URL = 'https://www.linkedin.com/jobs/search?keywords=Java&location=Brasil&geoId=106057199&f_TPR=r86400&position=1&pageNum=0';

  async scrapeJobs(keyword?: string) {
    let url = this.DEFAULT_URL;
    
    if (keyword) {
      const encodedKeyword = encodeURIComponent(keyword);
      url = `https://www.linkedin.com/jobs/search?keywords=${encodedKeyword}&location=Brasil&geoId=106057199&f_TPR=r86400&position=1&pageNum=0`;
    }

    console.log(`[Scraper] Iniciando scrape em: ${url}`);

    let browser: Browser | null = null;

    try {
      // Initialize Playwright browser
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);

      const jobs: any[] = [];
      const jobCards = $('ul.jobs-search__results-list li');

      console.log(`[Scraper] Encontrados ${jobCards.length} cards de vagas.`);

      jobCards.each((i, element) => {
        const title = $(element).find('.base-search-card__title').text().trim();
        const company = $(element).find('.base-search-card__subtitle').text().trim();
        const location = $(element).find('.job-search-card__location').text().trim();
        const postedDate = $(element).find('time').text().trim();
        const jobUrl = $(element).find('a.base-card__full-link').attr('href');

        const cleanUrl = jobUrl ? jobUrl.split('?')[0] : '';

        if (title && cleanUrl) {
          jobs.push({
            title,
            company,
            location,
            postedDate,
            jobUrl: cleanUrl,
          });
        }
      });

      console.log(`[Scraper] Extraídos ${jobs.length} vagas válidas. Processando detalhes...`);

      let newCount = 0;
      // Process up to 10 jobs
      const jobsToProcess = jobs.slice(0, 10);

      for (const job of jobsToProcess) {
        const exists = await prisma.job.findUnique({
          where: { jobUrl: job.jobUrl },
        });

        if (!exists) {
          console.log(`[Scraper] Buscando detalhes para: ${job.title}`);
          const description = await this.fetchJobDescription(browser, job.jobUrl);

          await prisma.job.create({
            data: {
              title: job.title,
              company: job.company,
              location: job.location,
              postedDate: job.postedDate,
              jobUrl: job.jobUrl,
              description: description || 'Descrição indisponível no momento.',
            },
          });
          newCount++;
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      console.log(`[Scraper] Finalizado. ${newCount} novas vagas salvas.`);
      return { count: newCount, jobs };

    } catch (error) {
      console.error('[Scraper] Erro ao realizar scraping:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async fetchJobDescription(browser: Browser, url: string): Promise<string | null> {
    let page = null;
    try {
      page = await browser.newPage();

      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      });

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const selector = '.show-more-less-html__markup, .description__text';

      try {
        await page.waitForSelector(selector, { timeout: 5000 });
      } catch (e) {
        console.warn(`[Scraper] Selector timeout for ${url}`);
      }

      const description = await page.evaluate(() => {
        const el = document.querySelector('.show-more-less-html__markup') ||
                   document.querySelector('.description__text') ||
                   document.querySelector('#job-details');

        if (!el) return null;
        return (el as HTMLElement).innerText.trim();
      });

      return description;

    } catch (error) {
      console.error(`[Scraper] Falha ao obter descrição para ${url}:`, error);
      return null;
    } finally {
      if (page) await page.close();
    }
  }
}
