import { chromium, Browser } from 'playwright';

export class BrowserService {
  private static instance: Browser | null = null;

  private constructor() {}

  public static async getInstance(): Promise<Browser> {
    if (!BrowserService.instance || !BrowserService.instance.isConnected()) {
      console.log('[BrowserService] Initializing new browser instance...');
      BrowserService.instance = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return BrowserService.instance;
  }

  public static async closeInstance(): Promise<void> {
    if (BrowserService.instance) {
      console.log('[BrowserService] Closing browser instance...');
      await BrowserService.instance.close();
      BrowserService.instance = null;
    }
  }
}
