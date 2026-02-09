import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { Browser } from 'playwright';
import { BrowserService } from './browser.service';

const prisma = new PrismaClient();

export class ScraperService {
  /** 
   * Monta a URL de busca do LinkedIn garantindo filtros fixos de:
   * - Vagas postadas nas últimas 24h
   * - Trabalho remoto
   * - GeoId do Brasil
   * - Paginação (start)
   * A keyword e a location podem ser customizadas, mas sempre dentro do contexto Brasil.
   */
  private buildSearchUrl(options?: {
    keyword?: string;
    location?: string;
    last24h?: boolean;
    remote?: boolean;
    page?: number;
  }) {
    // Se não houver keyword, a busca fica vazia (o que o LinkedIn aceita)
    const keyword = options?.keyword?.trim() || '';
    const location = options?.location?.trim() || 'Brasil';

    const params = new URLSearchParams();
    params.set('keywords', keyword);
    params.set('location', location);
    params.set('geoId', '106057199'); // Brasil
    
    // Filtros opcionais baseados nas preferências do usuário:
    if (options?.last24h) {
      params.set('f_TPR', 'r86400'); // Últimas 24 horas
    }

    if (options?.remote) {
      params.set('f_WT', '2');      // Remoto
    }

    // Paginação: LinkedIn usa 'start' (0, 25, 50...)
    if (options?.page) {
      params.set('start', (options.page * 25).toString());
    }
    
    params.set('origin', 'JOB_SEARCH_PAGE_SEARCH_BUTTON');
    params.set('refresh', 'true');

    return `https://www.linkedin.com/jobs/search?${params.toString()}`;
  }

  /**
   * Executa o scraping baseado nas keywords definidas pelos usuários no banco.
   * - Busca todos os usuários com keywords cadastradas.
   * - Remove duplicatas e keywords vazias.
   * - Executa o scrapeJobs para cada keyword única.
   * - Se não houver keywords, executa uma busca padrão ampla.
   */
  async scrapeForUsers() {
    console.log('[Scraper] Iniciando ciclo de scraping baseado em usuários...');

    // 1. Busca keywords distintas dos usuários
    const users = await prisma.user.findMany({
      where: {
        keyword: { not: null },
        isActive: true // Opcional: apenas usuários ativos
      },
      select: {
        keyword: true
      }
    });

    // Filtra nulos, vazios e cria lista única
    const distinctKeywords = [...new Set(
      users
        .map(u => u.keyword?.trim())
        .filter((k): k is string => !!k && k.length > 0)
    )];

    console.log(`[Scraper] Encontradas ${distinctKeywords.length} keywords únicas de usuários: ${distinctKeywords.join(', ')}`);

    // 2. Se não houver keywords, faz busca padrão (fallback)
    if (distinctKeywords.length === 0) {
      console.log('[Scraper] Nenhuma keyword de usuário encontrada. Executando busca global padrão.');
      await this.scrapeJobs({
        keyword: '',
        location: 'Brasil',
        last24h: true,
        remote: true
      });
      return;
    }

    // 3. Itera sobre cada keyword e executa o scraping
    for (const keyword of distinctKeywords) {
      console.log(`[Scraper] >>> Processando keyword: "${keyword}" <<<`);
      try {
        await this.scrapeJobs({
          keyword,
          location: 'Brasil',
          last24h: true,
          remote: true
        });
        
        // Pausa entre keywords para não sobrecarregar o browser/LinkedIn
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`[Scraper] Erro ao processar keyword "${keyword}":`, error);
        // Continua para a próxima keyword mesmo com erro
      }
    }

    console.log('[Scraper] Ciclo de scraping baseado em usuários finalizado.');
  }

  /**
   * Executa o processo principal de scraping:
   * - Itera por múltiplas páginas (0 a 3) para encontrar mais vagas
   * - Usa Playwright exclusivamente (sem Axios) com Scroll para carregar vagas dinâmicas
   * - Extrai dados e salva no banco
   */
  async scrapeJobs(options?: {
    keyword?: string;
    location?: string;
    last24h?: boolean;
    remote?: boolean;
  }) {
    // Configuração para buscar múltiplas páginas e evitar "sempre as mesmas vagas"
    const MAX_PAGES = 4; // Busca até a página 4 (aprox. 100 vagas)
    let totalNewJobs = 0;
    const allJobsFound: any[] = [];

    let browser: Browser;
    try {
      browser = await BrowserService.getInstance();
    } catch (e) {
      console.error('[Scraper] Erro ao iniciar BrowserService', e);
      throw e;
    }

    // Set para rastrear duplicatas dentro da mesma execução (entre páginas)
    const seenUrls = new Set<string>();

    for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
      const url = this.buildSearchUrl({ ...options, page: pageNum });
      const filters = [];
      if (options?.last24h) filters.push('24h');
      if (options?.remote) filters.push('Remoto');
      filters.push(`Pág ${pageNum + 1}`);

      console.log(`[Scraper] Buscando vagas (${filters.join(', ')}) em: ${url}`);

      let html: string = '';
      let page = null;

      try {
        page = await browser.newPage();
        await page.setViewportSize({ width: 1280, height: 800 });
        
        // Navega e espera apenas o DOM carregar (mais rápido e evita timeouts)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Espera explícita pela lista de vagas para garantir carregamento
        try {
            await page.waitForSelector('ul.jobs-search__results-list', { timeout: 10000 });
        } catch (e) {
            console.warn(`[Scraper] Timeout esperando lista de vagas na pág ${pageNum + 1}`);
        }

        // Scroll suave para disparar o carregamento de mais itens (Infinite Scroll)
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
          await page.waitForTimeout(2000); // Espera carregar novos cards
        }

        html = await page.content();
      } catch (error) {
        console.error(`[Scraper] Erro ao carregar página ${pageNum + 1}:`, error);
        // Continua para a próxima página mesmo se esta falhar
      } finally {
        if (page) await page.close();
      }

      if (!html) continue;

      const $ = cheerio.load(html);
      const jobsOnPage: any[] = [];
      const jobCards = $('ul.jobs-search__results-list li');

      console.log(`[Scraper] Encontrados ${jobCards.length} cards na página ${pageNum + 1}.`);

      const keywordFilter = options?.keyword?.trim().toLowerCase() || '';

      jobCards.each((_, element) => {
        const title = $(element).find('.base-search-card__title').text().trim();
        const company = $(element).find('.base-search-card__subtitle').text().trim();
        const location = $(element).find('.job-search-card__location').text().trim();
        const postedDate = $(element).find('time').text().trim();
        const jobUrl = $(element).find('a.base-card__full-link').attr('href');

        const cleanUrl = jobUrl ? jobUrl.split('?')[0] : '';

        // Verifica duplicata na execução atual
        if (cleanUrl && seenUrls.has(cleanUrl)) {
            return; // Pula duplicata
        }

        if (title && cleanUrl) {
          seenUrls.add(cleanUrl); // Marca como visto
          jobsOnPage.push({ title, company, location, postedDate, jobUrl: cleanUrl });
        }
      });

      if (jobsOnPage.length === 0) {
        console.log(`[Scraper] Nenhuma vaga nova encontrada na página ${pageNum + 1} (possível fim da lista ou duplicatas). Interrompendo.`);
        break;
      }

      console.log(`[Scraper] Extraídos ${jobsOnPage.length} vagas ÚNICAS da página ${pageNum + 1}. Processando...`);

      // Usa o método de processamento em lote
      const processResult = await this.processBatch(jobsOnPage, browser);
      totalNewJobs += processResult.count;
      allJobsFound.push(...jobsOnPage);

      // Pausa amigável entre páginas para evitar rate limit
      if (pageNum < MAX_PAGES - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log(`[Scraper] Finalizado Global. ${totalNewJobs} novas vagas salvas no total.`);
    return { count: totalNewJobs, jobs: allJobsFound };
  }

  /**
   * Processa um conjunto de vagas em lotes pequenos para:
   * - Buscar detalhes (descrição) de cada vaga
   * - Evitar bans do LinkedIn usando pausas entre lotes
   * - Controlar quantas vagas são processadas por execução
   */
  private async processBatch(jobs: any[], browser: Browser) {
      let newCount = 0;
      const jobsToProcess = jobs.slice(0, 20); // Limitado a 20 por página para evitar bans excessivos
      const BATCH_SIZE = 3;

      for (let i = 0; i < jobsToProcess.length; i += BATCH_SIZE) {
          const batch = jobsToProcess.slice(i, i + BATCH_SIZE);
          console.log(`[Scraper] Processando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(jobsToProcess.length / BATCH_SIZE)}`);
          
          const results = await Promise.all(
              batch.map(job => this.processJob(job, browser))
          );
          
          newCount += results.filter(Boolean).length;
          
          if (i + BATCH_SIZE < jobsToProcess.length) {
              await new Promise(r => setTimeout(r, 3000));
          }
      }
      return { count: newCount };
  }

  /**
   * Processa uma única vaga:
   * - Verifica se a vaga já existe no banco (jobUrl único)
   * - Caso não exista, busca a descrição detalhada
   * - Filtra vagas cuja descrição contenha "Inglês" ou "English"
   * - Salva a vaga completa na tabela Job se passar nos filtros
   * Retorna true se criou uma nova vaga, false caso contrário ou em erro.
   */
  private async processJob(job: any, browser: Browser): Promise<boolean> {
      try {
        const exists = await prisma.job.findUnique({
            where: { jobUrl: job.jobUrl },
        });

        if (!exists) {
            console.log(`[Scraper] Buscando detalhes para: ${job.title}`);
            const description = await this.fetchJobDescription(browser, job.jobUrl);

            // Regra de Negócio: Ignorar vagas que exigem Inglês
            if (description && /english|inglês/i.test(description)) {
                console.log(`[Scraper] Vaga ignorada (Idioma Inglês detectado): ${job.title}`);
                return false;
            }

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
            return true;
        }
      } catch (error) {
          console.error(`[Scraper] Erro ao processar vaga ${job.title}:`, error);
      }
      return false;
  }

  /**
   * Acessa a página individual da vaga usando o Playwright e:
   * - Configura headers para simular um navegador real
   * - Espera o seletor de descrição aparecer
   * - Extrai o texto da descrição se disponível
   * Retorna o texto da descrição ou null em caso de falha.
   */
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
