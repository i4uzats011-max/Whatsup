export interface ContactRow {
  id: string;
  name: string;
  phone: string;
  group?: string;
  message: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  error?: string;
  sentAt?: string;
}

export interface AutomationSettings {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  defaultCountryCode: string;
  randomizeDelay: boolean;
  sendToGroups: boolean;
  closeBrowserOnComplete: boolean;
  preferredMode: 'auto' | 'phone_only' | 'name_only';
  speedMode: 'fast' | 'balanced' | 'safe';
}

export interface AutomationProgress {
  sessionId: string;
  isRunning: boolean;
  isPaused: boolean;
  isLoggedIn: boolean;
  qrCodeImage: string | null;
  chromeInstalled: boolean;
  chromePath: string;
  total: number;
  current: number;
  sent: number;
  failed: number;
  pending: number;
  currentContact?: ContactRow | null;
  startedAt?: string;
  logs: LogEntry[];
}

export interface UserSessionSummary {
  id: string;
  name: string;
  isLoggedIn: boolean;
  isRunning: boolean;
  sent: number;
  total: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ExcelColumnMapping {
  nameCol: string;
  phoneCol: string;
  groupCol?: string;
  messageCol: string;
}
