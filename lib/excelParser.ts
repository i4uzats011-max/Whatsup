import * as XLSX from 'xlsx';
import { ContactRow } from '@/types';

// Helper to determine if a string is a phone number or a name/group
export function isPhoneNumber(val: string): boolean {
  if (!val) return false;
  const str = String(val).trim();

  // If it has alphabet letters (like Sabrin Ji, todays works), it is 100% a Name/Group, NOT a phone number!
  const hasLetters = /[a-zA-Z\u0600-\u06FF\u0900-\u097F]/.test(str);
  if (hasLetters) {
    return false;
  }

  // Count digits
  const digits = str.replace(/\D/g, '');
  // A phone number must have at least 7 digits and at most 15 digits
  return digits.length >= 7 && digits.length <= 15;
}

// Helper to sanitize phone numbers with country code
export function sanitizePhoneNumber(val: string, defaultCountryCode: string = '91'): string {
  let digits = String(val || '').replace(/\D/g, '');
  const cleanCC = defaultCountryCode.replace(/\D/g, '') || '91';

  // If 11 digits starting with 0 (e.g. 09266120876), strip leading 0
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // If 10 digits (e.g. 9266120876), prepend default country code (91)
  if (digits.length === 10) {
    digits = `${cleanCC}${digits}`;
  }

  return digits;
}

export function parseExcelBuffer(buffer: ArrayBuffer | Buffer, defaultCountryCode: string = '91'): ContactRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Read raw rows
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    return [];
  }

  const contacts: ContactRow[] = [];
  const cleanDefaultCC = defaultCountryCode.replace(/\D/g, '') || '91';

  rawRows.forEach((row, index) => {
    const keys = Object.keys(row);
    if (keys.length === 0) return;

    let target = '';
    let message = '';

    // =========================================================================
    // 2-COLUMN FORMAT:
    // Column 1: Contact Target (Name like "Sabrin Ji", Group like "todays works", or Number like "+91 9266120876")
    // Column 2: Message Text
    // =========================================================================
    if (keys.length === 2) {
      target = String(row[keys[0]] ?? '').trim();
      message = String(row[keys[1]] ?? '').trim();
    } else {
      // Find Message column if header matches
      const msgKey = keys.find(k => {
        const l = k.toLowerCase().trim();
        return l === 'message' || l === 'msg' || l === 'text' || l === 'sms' || l === 'body';
      });

      if (msgKey) {
        message = String(row[msgKey] ?? '').trim();
      }

      // Find Target column (the non-message column)
      const targetKey = keys.find(k => k !== msgKey && String(row[k] ?? '').trim().length > 0) || keys[0];
      target = String(row[targetKey] ?? '').trim();

      // If message was not in a labeled column, pick the second available column
      if (!message && keys.length >= 2) {
        const secondKey = keys.find(k => k !== targetKey);
        if (secondKey) {
          message = String(row[secondKey] ?? '').trim();
        }
      }
    }

    if (!target) return;

    // Check if target has comma separator like "Sabrin Ji, 9266120876"
    let parsedName = '';
    let parsedPhone = '';

    if (target.includes(',') || target.includes(';') || target.includes('|')) {
      const parts = target.split(/[,;|]/).map(s => s.trim());
      for (const p of parts) {
        if (isPhoneNumber(p) && !parsedPhone) {
          parsedPhone = sanitizePhoneNumber(p, cleanDefaultCC);
        } else if (!parsedName) {
          parsedName = p;
        }
      }
    } else {
      // Single value in Column 1:
      if (isPhoneNumber(target)) {
        parsedPhone = sanitizePhoneNumber(target, cleanDefaultCC);
        parsedName = `+${parsedPhone}`;
      } else {
        // Name or Group name (e.g. "Sabrin Ji" or "todays works")
        parsedName = target;
        parsedPhone = '';
      }
    }

    // Default message fallback if empty
    if (!message) {
      message = 'Hello {name}, greetings from our team!';
    }

    contacts.push({
      id: `contact-${index + 1}-${Date.now()}`,
      name: parsedName,
      phone: parsedPhone,
      group: parsedPhone ? '' : parsedName,
      message: message,
      status: 'pending',
    });
  });

  return contacts;
}

export function generateSampleExcelBuffer(): Buffer {
  // 2-Column sample format showing Contact Target (Name, Group, Number) in Column 1 and Message in Column 2!
  const sampleData = [
    {
      "Contact (Name, Group or Number)": "Sabrin Ji",
      "Message": "Hello Sabrin Ji, your update is ready!"
    },
    {
      "Contact (Name, Group or Number)": "+91 9266120876",
      "Message": "Hello! Direct message to your mobile number."
    },
    {
      "Contact (Name, Group or Number)": "todays works",
      "Message": "Hello team, today's group announcement."
    },
    {
      "Contact (Name, Group or Number)": "9266120876",
      "Message": "Hi! Automatic notification sent to your contact number."
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 32 }, // Contact (Name, Group or Number)
    { wch: 65 }, // Message
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "WhatsApp Contacts");

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
