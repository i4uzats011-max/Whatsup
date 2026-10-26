import { NextResponse } from 'next/server';
import { generateSampleExcelBuffer } from '@/lib/excelParser';

export async function GET() {
  try {
    const buffer = generateSampleExcelBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="sample_whatsapp_contacts.xlsx"',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
