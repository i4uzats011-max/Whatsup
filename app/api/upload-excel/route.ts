import { NextResponse } from 'next/server';
import { parseExcelBuffer } from '@/lib/excelParser';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const defaultCountryCode = (formData.get('defaultCountryCode') as string) || '91';

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const contacts = parseExcelBuffer(buffer, defaultCountryCode);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      count: contacts.length,
      contacts,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
