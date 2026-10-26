import { NextResponse } from 'next/server';
import { automationManager } from '@/lib/chromeAutomation';
import { ContactRow, AutomationSettings } from '@/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const contacts: ContactRow[] = body.contacts;
    const settings: Partial<AutomationSettings> = body.settings || {};

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ success: false, message: 'No contacts provided in list.' }, { status: 400 });
    }

    // Pre-flight check: Verify if WhatsApp login session is active
    const isLoggedIn = await automationManager.checkIfLoggedInNow();
    if (!isLoggedIn) {
      automationManager.addLog('warning', 'Attempted to start sending, but WhatsApp Web is not logged in. Please scan the QR code first.');
      return NextResponse.json({
        success: false,
        message: 'WhatsApp Web is NOT logged in! Please scan the QR code before sending.',
        needsLogin: true,
      }, { status: 400 });
    }

    const result = await automationManager.startCampaign(contacts, settings);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
