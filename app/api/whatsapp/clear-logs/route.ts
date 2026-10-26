import { NextResponse } from 'next/server';
import { automationManager } from '@/lib/chromeAutomation';

export async function POST() {
  try {
    if (typeof automationManager.clearLogs === 'function') {
      automationManager.clearLogs();
    } else {
      (automationManager as any).logs = [];
    }
    return NextResponse.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
