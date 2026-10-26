import { NextResponse } from 'next/server';
import { automationManager } from '@/lib/chromeAutomation';

export async function GET() {
  const status = automationManager.getStatus();
  return NextResponse.json({
    sessions: [
      {
        id: 'main',
        name: 'Permanent WhatsApp Session',
        isLoggedIn: status.isLoggedIn,
        isRunning: status.isRunning,
      },
    ],
  });
}
