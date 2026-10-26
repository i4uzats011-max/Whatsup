import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { ContactRow, AutomationSettings, LogEntry, AutomationProgress } from '@/types';

export function getChromeExecutablePath(): string {
  const possiblePaths = [
    // Standard Google Chrome
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),

    // Open-source Chromium
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Chromium\\Application\\chrome.exe'),

    // Microsoft Edge (100% Chromium, pre-installed on all Windows 10 & 11)
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

export function cleanOrphanProcessesAndLocks(sessionDir: string): void {
  try {
    if (process.platform === 'win32') {
      const folderName = path.basename(sessionDir);
      // Fast WMI query filtered at kernel level (< 400ms instead of 15s)
      const script = `Get-CimInstance Win32_Process -Filter "(Name = 'chrome.exe' or Name = 'msedge.exe') and CommandLine like '%${folderName}%'" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { stdio: 'ignore', timeout: 8000 });
    }
  } catch (e) {
    // quiet cleanup
  }

  const lockFiles = [
    path.join(sessionDir, 'lockfile'),
    path.join(sessionDir, 'DevToolsActivePort'),
    path.join(sessionDir, 'SingletonLock'),
    path.join(sessionDir, 'SingletonCookie'),
    path.join(sessionDir, 'SingletonSocket'),
  ];

  for (const f of lockFiles) {
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    } catch (e) {
      // ignore
    }
  }
}

export class WhatsAppAutomationManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private stopRequested: boolean = false;
  private isLoggedIn: boolean = false;
  private qrCodeImage: string | null = null;
  private qrCheckInterval: NodeJS.Timeout | null = null;
  private contacts: ContactRow[] = [];
  private settings: AutomationSettings = {
    minDelaySeconds: 1,
    maxDelaySeconds: 2,
    defaultCountryCode: '91',
    randomizeDelay: true,
    sendToGroups: true,
    closeBrowserOnComplete: false,
    preferredMode: 'auto',
    speedMode: 'fast',
  };
  private currentIndex: number = 0;
  private sentCount: number = 0;
  private failedCount: number = 0;
  private logs: LogEntry[] = [];
  private sessionDir: string;

  constructor() {
    // ALWAYS WRITABLE PROFILE DIRECTORY: In user's AppData (safe from Windows Program Files permissions)
    const baseDir = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
    this.sessionDir = path.join(baseDir, 'WhatsAppChromeAutomation', 'profile');

    // Migrate from older local directory if it exists
    const legacyLocalDir = path.join(process.cwd(), 'whatsapp_session_profile');
    if (fs.existsSync(legacyLocalDir) && !fs.existsSync(this.sessionDir)) {
      try {
        fs.mkdirSync(path.dirname(this.sessionDir), { recursive: true });
        fs.cpSync(legacyLocalDir, this.sessionDir, { recursive: true });
      } catch (err) {
        console.error('Failed to migrate session profile', err);
      }
    }

    if (!fs.existsSync(this.sessionDir)) {
      try {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create session dir', err);
      }
    }
    // Background monitor to verify login and capture QR only if needed
    this.startQRMonitor();
  }

  public addLog(type: LogEntry['type'], message: string) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 300) {
      this.logs.pop();
    }
    console.log(`[WhatsApp Automation][${type.toUpperCase()}] ${message}`);
  }

  public clearLogs() {
    this.logs = [];
    console.log('[WhatsApp Automation] Terminal logs cleared by user.');
  }

  public getStatus(): AutomationProgress {
    const currentContact = this.isRunning && this.contacts[this.currentIndex] ? this.contacts[this.currentIndex] : null;
    const chromePath = getChromeExecutablePath();
    const chromeInstalled = fs.existsSync(chromePath);

    return {
      sessionId: 'main',
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isLoggedIn: this.isLoggedIn,
      qrCodeImage: this.qrCodeImage,
      chromeInstalled,
      chromePath,
      total: this.contacts.length,
      current: this.currentIndex,
      sent: this.sentCount,
      failed: this.failedCount,
      pending: Math.max(0, this.contacts.length - (this.sentCount + this.failedCount)),
      currentContact,
      logs: this.logs.slice(0, 100),
    };
  }

  public getContacts(): ContactRow[] {
    return this.contacts;
  }

  public setContacts(contacts: ContactRow[]) {
    this.contacts = contacts;
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private startQRMonitor() {
    if (this.qrCheckInterval) return;

    this.qrCheckInterval = setInterval(async () => {
      try {
        if (!this.browser || !this.browser.connected || !this.page) {
          return;
        }

        // Check if logged in (chat list pane visible)
        const isAuth = await this.page.evaluate(() => {
          const chatList =
            document.querySelector('#pane-side') ||
            document.querySelector('#side') ||
            document.querySelector('div[aria-label="Chat list"]') ||
            document.querySelector('div[data-testid="chat-list"]') ||
            document.querySelector('header span[data-icon="community"]');
          return !!chatList;
        }).catch(() => false);

        if (isAuth) {
          if (!this.isLoggedIn) {
            this.isLoggedIn = true;
            this.qrCodeImage = null;
            this.addLog('success', 'WhatsApp Web is authenticated and ready! Saved session will be reused.');
          }
          return;
        }

        this.isLoggedIn = false;

        // Auto reload expired QR if button exists
        const reloadBtn = await this.page.$('button[data-testid="qrcode-reload"], span[data-icon="refresh"], div[data-ref] button').catch(() => null);
        if (reloadBtn) {
          await reloadBtn.click().catch(() => {});
          await this.sleep(1000);
        }

        // Capture QR screenshot only if not logged in
        const qrEl = await this.page.$('div[data-ref], canvas, div[data-testid="qrcode"]').catch(() => null);
        if (qrEl) {
          const b64 = await qrEl.screenshot({ encoding: 'base64' }).catch(() => null);
          if (b64) {
            this.qrCodeImage = `data:image/png;base64,${b64}`;
          }
        }
      } catch (e) {
        // quiet background monitor
      }
    }, 2000);
  }

  public async checkIfLoggedInNow(): Promise<boolean> {
    if (!this.browser || !this.browser.connected || !this.page) {
      return false;
    }
    try {
      const isAuth = await this.page.evaluate(() => {
        const chatList =
          document.querySelector('#pane-side') ||
          document.querySelector('#side') ||
          document.querySelector('div[aria-label="Chat list"]') ||
          document.querySelector('div[data-testid="chat-list"]') ||
          document.querySelector('header span[data-icon="community"]');
        return !!chatList;
      }).catch(() => false);

      this.isLoggedIn = !!isAuth;
      if (this.isLoggedIn) {
        this.qrCodeImage = null;
      }
      return this.isLoggedIn;
    } catch (e) {
      return false;
    }
  }

  public async openBrowserOnly(): Promise<{ success: boolean; message: string }> {
    try {
      const chromePath = getChromeExecutablePath();
      if (!fs.existsSync(chromePath)) {
        this.addLog('error', `Google Chrome not found at: ${chromePath}.`);
        return {
          success: false,
          message: `Google Chrome was not found. Please install Google Chrome from https://www.google.com/chrome/`,
        };
      }

      // If browser is already open and connected, reuse it immediately!
      if (this.browser && this.browser.connected && this.page) {
        this.addLog('info', 'Reusing existing active Chrome window (saved session active)...');
        try {
          await this.page.bringToFront();
          const currentUrl = this.page.url();
          if (!currentUrl.includes('web.whatsapp.com')) {
            await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
          await this.checkIfLoggedInNow();
          return { success: true, message: 'Google Chrome is already open and using your saved WhatsApp session.' };
        } catch (e) {
          await this.restartBrowser();
          return { success: true, message: 'Reconnected to Google Chrome.' };
        }
      }

      this.addLog('info', `Launching Google Chrome from: ${chromePath}`);
      this.addLog('info', `Loading permanent saved session profile: ${this.sessionDir}`);

      // Self-healing: Clean up any stale lock files or orphaned Chrome instances before launch
      cleanOrphanProcessesAndLocks(this.sessionDir);

      const launchOptions = {
        executablePath: chromePath,
        headless: false,
        userDataDir: this.sessionDir,
        defaultViewport: null,
        args: [
          '--start-maximized',
          '--window-position=50,50',
          '--window-size=1280,850',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--no-default-browser-check',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      };

      try {
        this.browser = await puppeteer.launch(launchOptions);
      } catch (launchErr: any) {
        this.addLog('warning', `Chrome launch initial attempt: ${launchErr.message}. Clearing locks and retrying...`);
        cleanOrphanProcessesAndLocks(this.sessionDir);
        await this.sleep(1500);
        this.browser = await puppeteer.launch(launchOptions);
      }

      const pages = await this.browser.pages();
      this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();

      // Stealth & Real Browser User-Agent to avoid WhatsApp Web connection flags
      try {
        await this.page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        );
        await this.page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
      } catch (e) {}

      this.browser.on('disconnected', () => {
        this.addLog('warning', 'Google Chrome was closed.');
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.qrCodeImage = null;
        this.isRunning = false;
        // Clean up any remaining helper background processes (crashpad, gpu, etc.)
        cleanOrphanProcessesAndLocks(this.sessionDir);
      });

      this.addLog('info', 'Opening WhatsApp Web (https://web.whatsapp.com)...');
      try {
        await this.page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 90000 });
      } catch (navErr: any) {
        this.addLog('warning', `WhatsApp Web initial load note: ${navErr.message}. Waiting for page elements...`);
      }
      await this.page.bringToFront();

      // Check if already authenticated from saved session
      await this.sleep(3000);
      const isAuth = await this.checkIfLoggedInNow();
      if (isAuth) {
        this.addLog('success', 'Logged in automatically using saved WhatsApp session! No QR scan needed.');
      } else {
        this.addLog('info', 'WhatsApp Web loaded. Please scan QR code once to save session permanently.');
      }

      return { success: true, message: 'WhatsApp Web opened in Google Chrome.' };
    } catch (err: any) {
      this.addLog('error', `Failed to open Chrome: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  public async disconnectSession(): Promise<{ success: boolean; message: string }> {
    this.addLog('warning', 'Disconnecting WhatsApp session and logging out...');
    this.isRunning = false;
    this.isLoggedIn = false;
    this.qrCodeImage = null;

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.page = null;
    }

    cleanOrphanProcessesAndLocks(this.sessionDir);
    await this.sleep(1200);

    // Completely wipe the saved WhatsApp login profile
    try {
      if (fs.existsSync(this.sessionDir)) {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.sessionDir, { recursive: true });
      this.addLog('success', 'WhatsApp session disconnected and logged out. All credentials removed.');
      return { success: true, message: 'WhatsApp session disconnected successfully. You can now connect a new WhatsApp account.' };
    } catch (err: any) {
      this.addLog('error', `Failed to clear profile directory: ${err.message}`);
      return { success: false, message: `Failed to remove session directory: ${err.message}` };
    }
  }

  public async forceReset(): Promise<{ success: boolean; message: string }> {
    this.addLog('warning', 'Force terminating any background Chrome processes and resetting session lock...');
    this.isRunning = false;
    this.isLoggedIn = false;
    this.qrCodeImage = null;

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.page = null;
    }

    cleanOrphanProcessesAndLocks(this.sessionDir);
    await this.sleep(1200);
    return await this.openBrowserOnly();
  }

  public async restartBrowser(): Promise<{ success: boolean; message: string }> {
    this.addLog('warning', 'Refreshing Google Chrome browser connection...');
    this.qrCodeImage = null;
    this.isLoggedIn = false;

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.page = null;
    }

    cleanOrphanProcessesAndLocks(this.sessionDir);
    await this.sleep(1200);
    return await this.openBrowserOnly();
  }

  public async ensureBrowserAndLogin(): Promise<boolean> {
    if (!this.browser || !this.browser.connected || !this.page) {
      const openResult = await this.openBrowserOnly();
      if (!openResult.success) return false;
    }

    if (!this.page) return false;

    // Fast check if already authenticated
    const alreadyAuth = await this.checkIfLoggedInNow();
    if (alreadyAuth) {
      return true;
    }

    this.addLog('info', 'Checking WhatsApp Web authentication...');
    const startTime = Date.now();

    while (Date.now() - startTime < 90000) {
      if (this.stopRequested) return false;

      const chatListExists = await this.page.evaluate(() => {
        const side = document.querySelector('#pane-side') || document.querySelector('div[aria-label="Chat list"]');
        return !!side;
      }).catch(() => false);

      if (chatListExists) {
        this.isLoggedIn = true;
        this.qrCodeImage = null;
        this.addLog('success', 'WhatsApp Web is authenticated and session is saved permanently!');
        return true;
      }

      const qrEl = await this.page.$('div[data-ref], canvas, div[data-testid="qrcode"]').catch(() => null);
      if (qrEl) {
        const b64 = await qrEl.screenshot({ encoding: 'base64' }).catch(() => null);
        if (b64) {
          this.qrCodeImage = `data:image/png;base64,${b64}`;
        }
      }

      await this.sleep(1500);
    }

    if (!this.isLoggedIn) {
      this.addLog('error', 'Login timed out. Please scan the QR code to proceed.');
      return false;
    }

    return true;
  }

  public async startCampaign(contacts: ContactRow[], settings?: Partial<AutomationSettings>) {
    if (this.isRunning) {
      this.addLog('warning', 'Campaign is already running.');
      return { success: false, message: 'Campaign is already running.' };
    }

    if (!contacts || contacts.length === 0) {
      this.addLog('error', 'No contacts provided to send.');
      return { success: false, message: 'No contacts provided' };
    }

    this.contacts = contacts.map(c => ({ ...c, status: c.status === 'sent' ? 'sent' : 'pending' }));
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }

    if (this.settings.speedMode === 'fast') {
      this.settings.minDelaySeconds = 0.5;
      this.settings.maxDelaySeconds = 1;
      this.settings.randomizeDelay = false;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.stopRequested = false;
    this.currentIndex = 0;
    this.sentCount = this.contacts.filter(c => c.status === 'sent').length;
    this.failedCount = 0;

    this.addLog('info', `⚡ Starting high-speed campaign for ${this.contacts.length} recipients...`);

    this.runAutomationLoop().catch(err => {
      this.addLog('error', `Automation loop error: ${err.message}`);
      this.isRunning = false;
    });

    return { success: true, message: 'Campaign started successfully' };
  }

  public pauseCampaign() {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      this.addLog('warning', 'Campaign paused.');
      return { success: true, message: 'Campaign paused' };
    }
    return { success: false, message: 'Campaign is not running' };
  }

  public resumeCampaign() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.addLog('info', 'Campaign resumed.');
      return { success: true, message: 'Campaign resumed' };
    }
    return { success: false, message: 'Campaign is not paused' };
  }

  public async stopCampaign() {
    this.stopRequested = true;
    this.isRunning = false;
    this.isPaused = false;
    this.addLog('warning', 'Campaign stopped.');

    if (this.settings.closeBrowserOnComplete && this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      } catch (e) {}
    }

    return { success: true, message: 'Campaign stopped' };
  }

  private async runAutomationLoop() {
    try {
      const ready = await this.ensureBrowserAndLogin();
      if (!ready) {
        this.isRunning = false;
        return;
      }

      for (let i = 0; i < this.contacts.length; i++) {
        if (this.stopRequested) {
          this.addLog('warning', 'Campaign execution stopped.');
          break;
        }

        while (this.isPaused) {
          if (this.stopRequested) break;
          await this.sleep(500);
        }

        this.currentIndex = i;
        const contact = this.contacts[i];

        if (contact.status === 'sent') {
          continue;
        }

        contact.status = 'sending';
        const targetDisplay = contact.phone ? `+${contact.phone}` : (contact.name || contact.group);
        this.addLog('info', `[${i + 1}/${this.contacts.length}] ⚡ Sending to: ${contact.name || 'Recipient'} (${targetDisplay})...`);

        let sendSuccess = false;
        let errorMessage = '';

        const hasPhone = Boolean(contact.phone && contact.phone.trim().length >= 7);
        const searchTarget = (contact.name || contact.group || '').trim();

        let sendViaPhone = false;
        let sendViaName = false;

        if (this.settings.preferredMode === 'phone_only') {
          sendViaPhone = hasPhone;
          if (!hasPhone) errorMessage = 'Row has no mobile number (Phone Only mode)';
        } else if (this.settings.preferredMode === 'name_only') {
          sendViaName = Boolean(searchTarget);
          if (!searchTarget) errorMessage = 'Row has no contact or group name (Name Only mode)';
        } else {
          // 'auto' mode: Use Phone Number if available; otherwise search by Name / Group
          if (hasPhone) {
            sendViaPhone = true;
          } else if (searchTarget) {
            sendViaName = true;
          } else {
            errorMessage = 'Neither mobile number nor contact name provided';
          }
        }

        try {
          if (sendViaPhone) {
            sendSuccess = await this.sendToPhoneNumberFast(contact.phone, contact.message, contact.name);
          } else if (sendViaName) {
            sendSuccess = await this.sendBySearchingNameFast(searchTarget, contact.message, contact.name);
          }
        } catch (err: any) {
          errorMessage = err.message || 'Error occurred while sending';
        }

        if (sendSuccess) {
          contact.status = 'sent';
          contact.sentAt = new Date().toLocaleTimeString();
          this.sentCount++;
          this.addLog('success', `⚡ Delivered to ${contact.name || searchTarget} (${targetDisplay})`);
        } else {
          contact.status = 'failed';
          contact.error = errorMessage || 'Could not send message';
          this.failedCount++;
          this.addLog('error', `Failed sending to ${contact.name || searchTarget}: ${contact.error}`);
        }

        // Apply fast delay between messages
        if (i < this.contacts.length - 1 && !this.stopRequested) {
          let delaySeconds = this.settings.minDelaySeconds;
          if (this.settings.randomizeDelay && this.settings.maxDelaySeconds > this.settings.minDelaySeconds) {
            delaySeconds = Number((Math.random() * (this.settings.maxDelaySeconds - this.settings.minDelaySeconds) + this.settings.minDelaySeconds).toFixed(1));
          }
          if (delaySeconds > 0) {
            this.addLog('info', `Waiting ${delaySeconds}s before next contact...`);
            await this.sleep(delaySeconds * 1000);
          }
        }
      }

      this.addLog('success', `🎉 Campaign completed! Total sent: ${this.sentCount}, Failed: ${this.failedCount}`);
    } catch (loopErr: any) {
      this.addLog('error', `Campaign stopped unexpectedly: ${loopErr.message}`);
    } finally {
      this.isRunning = false;
      if (this.settings.closeBrowserOnComplete && this.browser) {
        try {
          await this.browser.close();
          this.browser = null;
          this.page = null;
        } catch (e) {}
      }
    }
  }

  private async dismissAnyPopups() {
    if (!this.page) return;
    try {
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const okBtn = btns.find((b) => {
          const t = (b.textContent || '').trim().toLowerCase();
          return t === 'continue' || t === 'ok' || t === 'close' || t === 'dismiss' || t === 'got it';
        });
        if (okBtn) (okBtn as HTMLElement).click();
      });
    } catch (e) {}
  }

  private async sendToPhoneNumberFast(phone: string, rawMessage: string, contactName: string): Promise<boolean> {
    if (!this.page) return false;

    await this.dismissAnyPopups();

    const finalMessage = rawMessage
      .replace(/{name}/gi, contactName || '')
      .replace(/{phone}/gi, phone);

    const cleanDigits = phone.replace(/\D/g, '');
    const tenDigits = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    // STEP 1: Ultra-fast search in WhatsApp search bar (takes ~0.8s!)
    try {
      const searchSelector = 'input[aria-label*="Search"], input[data-tab="3"], input[role="textbox"], div[contenteditable="true"][data-tab="3"]';
      const searchBox = await this.page.$(searchSelector);
      if (searchBox) {
        await searchBox.click();
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('A');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');

        await searchBox.type(tenDigits, { delay: 10 });
        await this.sleep(350);

        // Press Enter
        await this.page.keyboard.press('Enter');

        // Check if compose box appeared
        const inputSelector = 'footer div[contenteditable="true"], div[data-testid="conversation-compose-box-input"], div[aria-label*="Type a message"], div[role="textbox"][data-tab="10"]';
        const chatInput = await this.page.waitForSelector(inputSelector, { timeout: 2500 }).catch(() => null);

        if (chatInput) {
          await chatInput.click();
          await this.page.evaluate((el, msg) => {
            document.execCommand('insertText', false, msg);
          }, chatInput, finalMessage).catch(async () => {
            await chatInput.type(finalMessage, { delay: 2 });
          });

          await this.sleep(150);
          await this.page.keyboard.press('Enter');
          await this.sleep(300);
          await this.page.keyboard.press('Escape').catch(() => {});
          return true;
        }

        await this.page.keyboard.press('Escape').catch(() => {});
      }
    } catch (e) {}

    // STEP 2: Unsaved number -> Direct WhatsApp URL (with max 10s timeout, never 35s!)
    this.addLog('info', `⚡ Opening direct chat for unsaved number: +${cleanDigits}...`);
    const encodedText = encodeURIComponent(finalMessage);
    const targetUrl = `https://web.whatsapp.com/send?phone=${cleanDigits}&text=${encodedText}`;

    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

    const maxWaitMs = 10000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      if (this.stopRequested) return false;

      const isInvalid = await this.page.evaluate(() => {
        const dialog = document.querySelector('div[data-testid="popup-contents"]') || document.querySelector('div[role="alert"]');
        if (dialog) {
          const text = (dialog.textContent || '').toLowerCase();
          if (text.includes('invalid') || text.includes('not on whatsapp') || text.includes('does not exist')) {
            const okBtn = dialog.querySelector('button') as HTMLButtonElement;
            if (okBtn) okBtn.click();
            return true;
          }
        }
        return false;
      }).catch(() => false);

      if (isInvalid) {
        this.addLog('warning', `Number +${cleanDigits} is not registered on WhatsApp.`);
        return false;
      }

      // Check send button
      const sendBtn = await this.page.$('button[data-testid="compose-btn-send"], span[data-icon="send"], button[aria-label="Send"]').catch(() => null);
      if (sendBtn) {
        await sendBtn.click().catch(() => {});
        await this.sleep(300);
        return true;
      }

      // Check compose box
      const inputEl = await this.page.$('footer div[contenteditable="true"], div[data-testid="conversation-compose-box-input"]').catch(() => null);
      if (inputEl) {
        await inputEl.focus().catch(() => {});
        await this.page.keyboard.press('Enter').catch(() => {});
        await this.sleep(300);
        return true;
      }

      await this.sleep(200);
    }

    this.addLog('error', `Timed out opening chat for +${cleanDigits}`);
    return false;
  }

  private async sendBySearchingNameFast(targetName: string, rawMessage: string, contactName: string): Promise<boolean> {
    if (!this.page) return false;

    await this.dismissAnyPopups();

    this.addLog('info', `⚡ Searching WhatsApp for: "${targetName}"...`);

    const searchSelector = 'input[aria-label*="Search"], input[data-tab="3"], input[role="textbox"], div[contenteditable="true"][data-tab="3"]';
    await this.page.waitForSelector(searchSelector, { timeout: 6000 });
    const searchBox = await this.page.$(searchSelector);

    if (!searchBox) {
      throw new Error('Search bar not found');
    }

    await searchBox.click();
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('A');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');

    // Type target name quickly
    await searchBox.type(targetName, { delay: 10 });
    await this.sleep(350);

    // Open chat
    await this.page.keyboard.press('Enter');

    // Wait for compose input with fast polling
    const inputSelector = 'footer div[contenteditable="true"], div[data-testid="conversation-compose-box-input"], div[aria-label*="Type a message"], div[role="textbox"][data-tab="10"]';
    await this.page.waitForSelector(inputSelector, { timeout: 4000 });
    const chatInput = await this.page.$(inputSelector);

    if (!chatInput) {
      throw new Error(`Chat for "${targetName}" could not be opened`);
    }

    const finalMessage = rawMessage
      .replace(/{name}/gi, contactName || targetName)
      .replace(/{group}/gi, targetName);

    await chatInput.click();

    // Instant DOM text insertion
    await this.page.evaluate((el, msg) => {
      document.execCommand('insertText', false, msg);
    }, chatInput, finalMessage).catch(async () => {
      await chatInput.type(finalMessage, { delay: 2 });
    });

    await this.sleep(150);
    await this.page.keyboard.press('Enter');
    await this.sleep(300);

    await this.page.keyboard.press('Escape').catch(() => {});
    return true;
  }
}

// SINGLE GLOBAL PERMANENT INSTANCE (Saves and reuses WhatsApp login session permanently!)
declare global {
  var __whatsappSingletonManager: WhatsAppAutomationManager | undefined;
}

if (!global.__whatsappSingletonManager) {
  global.__whatsappSingletonManager = new WhatsAppAutomationManager();
} else {
  Object.setPrototypeOf(global.__whatsappSingletonManager, WhatsAppAutomationManager.prototype);
}

export const automationManager = global.__whatsappSingletonManager;

export function getAutomationManager(): WhatsAppAutomationManager {
  return global.__whatsappSingletonManager!;
}
