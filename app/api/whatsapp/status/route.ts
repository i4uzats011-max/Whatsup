import { NextResponse } from 'next/server';
import { automationManager } from '@/lib/chromeAutomation';

export async function GET() {
  const status = automationManager.getStatus();
  const contacts = automationManager.getContacts();

  return NextResponse.json({
    ...status,
    contacts,
  });
}
