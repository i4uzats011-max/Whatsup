import { NextResponse } from 'next/server';
import { automationManager } from '@/lib/chromeAutomation';

export async function POST() {
  try {
    const result = await automationManager.stopCampaign();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
