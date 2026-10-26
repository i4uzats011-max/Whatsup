import { NextResponse } from 'next/server';
import { automationManager } from '@/lib/chromeAutomation';

export async function POST(req: Request) {
  try {
    const { action } = await req.json();
    if (action === 'resume') {
      const result = automationManager.resumeCampaign();
      return NextResponse.json(result);
    } else {
      const result = automationManager.pauseCampaign();
      return NextResponse.json(result);
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
