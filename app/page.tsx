'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Download,
  Play,
  Pause,
  Square,
  Chrome,
  MessageSquare,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Settings2,
  FileSpreadsheet,
  Trash2,
  Search,
  ShieldCheck,
  RotateCw,
  QrCode,
  RefreshCw,
  Check,
  UserCheck,
  PhoneCall,
  Zap,
  Lock,
  Unlock,
  Wrench,
  ExternalLink,
  FileDown,
  LogOut
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ContactRow, AutomationProgress, AutomationSettings } from '@/types';

export default function Home() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isOpeningChrome, setIsOpeningChrome] = useState(false);
  const [isRestartingChrome, setIsRestartingChrome] = useState(false);
  const [isForceResetting, setIsForceResetting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'sent' | 'failed'>('all');

  // Fast Delivery Settings (Turbo Fast 0.5s - 1s default)
  const [settings, setSettings] = useState<AutomationSettings>({
    minDelaySeconds: 0.5,
    maxDelaySeconds: 1,
    defaultCountryCode: '91',
    randomizeDelay: false,
    sendToGroups: true,
    closeBrowserOnComplete: false,
    preferredMode: 'auto',
    speedMode: 'fast',
  });

  // Template override
  const [useCustomTemplate, setUseCustomTemplate] = useState(false);
  const [customTemplate, setCustomTemplate] = useState('Hello {name}, greetings from our team!');

  // Live status
  const [status, setStatus] = useState<AutomationProgress>({
    sessionId: 'main',
    isRunning: false,
    isPaused: false,
    isLoggedIn: false,
    qrCodeImage: null,
    chromeInstalled: true,
    chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    total: 0,
    current: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    currentContact: null,
    logs: [],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logTerminalRef = useRef<HTMLDivElement>(null);
  const qrSectionRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log box
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = 0;
    }
  }, [status.logs]);

  // Polling for live status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          setStatus(data);

          // Update contact statuses if backend has newer contact updates
          if (data.contacts && data.contacts.length > 0 && data.isRunning) {
            setContacts((prev) => {
              const updated = [...prev];
              data.contacts.forEach((backendC: ContactRow) => {
                const idx = updated.findIndex((c) => c.id === backendC.id || (c.phone && c.phone === backendC.phone));
                if (idx !== -1) {
                  updated[idx] = { ...updated[idx], status: backendC.status, error: backendC.error, sentAt: backendC.sentAt };
                }
              });
              return updated;
            });
          }
        }
      } catch (e) {
        // quiet error on poll
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  // Handle File Upload (2-Column format supported!)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('defaultCountryCode', settings.defaultCountryCode);

      const res = await fetch('/api/upload-excel', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.contacts) {
        setContacts(data.contacts);
        setSelectedIds(new Set(data.contacts.map((c: ContactRow) => c.id)));
        setUploadedFileName(file.name);
      } else {
        alert(data.message || 'Failed to parse Excel sheet.');
      }
    } catch (err: any) {
      alert('Error uploading file: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Load Sample 2-Column Demo Data (Mixed Name, Group, and Contact Number all in Column 1!)
  const loadDemoData = () => {
    const demo: ContactRow[] = [
      {
        id: 'demo-1',
        name: 'Sabrin Ji',
        phone: '', // Contact Name -> Dispatched by searching Name in WhatsApp
        group: 'Sabrin Ji',
        message: 'Hello Sabrin Ji! Your notification message is ready.',
        status: 'pending',
      },
      {
        id: 'demo-2',
        name: '+919266120876',
        phone: '919266120876', // Phone Number with +91 -> Dispatched to Mobile No
        group: '',
        message: 'Hello! Automated message sent to your mobile number +91 9266120876.',
        status: 'pending',
      },
      {
        id: 'demo-3',
        name: 'todays works',
        phone: '', // Group Name -> Dispatched by searching Group Name in WhatsApp
        group: 'todays works',
        message: "Hello team! Group notification for today's work.",
        status: 'pending',
      },
      {
        id: 'demo-4',
        name: '+919266120876',
        phone: '919266120876', // 10-digit number -> Prepend +91 and dispatched
        group: '',
        message: 'Hi! Reminder notification for your account.',
        status: 'pending',
      },
    ];
    setContacts(demo);
    setSelectedIds(new Set(demo.map((d) => d.id)));
    setUploadedFileName('sample_contacts.xlsx');
  };

  // Download Sample Template
  const downloadSampleTemplate = () => {
    window.open('/api/sample-excel', '_blank');
  };

  // Open Google Chrome & Check Login
  const handleOpenChrome = async () => {
    setIsOpeningChrome(true);
    try {
      const res = await fetch('/api/whatsapp/open-chrome', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert('Could not launch Chrome: ' + data.message);
      }
    } catch (err: any) {
      alert('Error opening Chrome: ' + err.message);
    } finally {
      setIsOpeningChrome(false);
    }
  };

  // Restart Chrome
  const handleRestartChrome = async () => {
    setIsRestartingChrome(true);
    try {
      const res = await fetch('/api/whatsapp/restart-chrome', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert('Could not refresh Chrome: ' + data.message);
      }
    } catch (err: any) {
      alert('Error restarting Chrome: ' + err.message);
    } finally {
      setIsRestartingChrome(false);
    }
  };

  // Force Kill & Reset Chrome (clears stuck profile locks and terminates orphaned processes)
  const handleForceResetChrome = async () => {
    if (!confirm('This will force-terminate any stuck Chrome processes and reconnect cleanly. Continue?')) return;
    setIsForceResetting(true);
    try {
      const res = await fetch('/api/whatsapp/force-reset', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert('Reset response: ' + data.message);
      }
    } catch (err: any) {
      alert('Error resetting Chrome: ' + err.message);
    } finally {
      setIsForceResetting(false);
    }
  };

  // Disconnect & Logout WhatsApp Session
  const handleDisconnectSession = async () => {
    if (!confirm('Are you sure you want to disconnect WhatsApp?\n\nThis will log out the active session and remove saved credentials so you can scan a new QR code.')) return;
    setIsDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus(prev => ({ ...prev, isLoggedIn: false, qrCodeImage: null }));
        alert('WhatsApp session disconnected successfully.');
      } else {
        alert('Disconnect notice: ' + data.message);
      }
    } catch (err: any) {
      alert('Error disconnecting session: ' + err.message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Start Campaign with Pre-flight Login Check!
  const handleStartCampaign = async () => {
    // 1. PRE-CHECK: Is WhatsApp Web Logged In?
    if (!status.isLoggedIn) {
      alert('⚠️ WhatsApp Web is NOT logged in yet!\n\nPlease scan the QR code displayed at the top of the page before starting.');
      if (qrSectionRef.current) {
        qrSectionRef.current.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    const selectedContacts = contacts
      .filter((c) => selectedIds.has(c.id))
      .map((c) => {
        let finalMsg = c.message;
        if (useCustomTemplate && customTemplate.trim()) {
          finalMsg = customTemplate;
        }
        return {
          ...c,
          message: finalMsg,
        };
      });

    if (selectedContacts.length === 0) {
      alert('Please select at least one contact to send messages.');
      return;
    }

    try {
      const res = await fetch('/api/whatsapp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: selectedContacts,
          settings,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'Failed to start campaign');
        if (data.needsLogin && qrSectionRef.current) {
          qrSectionRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }
    } catch (err: any) {
      alert('Error starting campaign: ' + err.message);
    }
  };

  // Speed Mode Preset Setter
  const setSpeedPreset = (mode: 'fast' | 'balanced' | 'safe') => {
    if (mode === 'fast') {
      setSettings((prev) => ({
        ...prev,
        speedMode: 'fast',
        minDelaySeconds: 0.5,
        maxDelaySeconds: 1,
        randomizeDelay: false,
      }));
    } else if (mode === 'balanced') {
      setSettings((prev) => ({
        ...prev,
        speedMode: 'balanced',
        minDelaySeconds: 1,
        maxDelaySeconds: 2,
        randomizeDelay: false,
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        speedMode: 'safe',
        minDelaySeconds: 3,
        maxDelaySeconds: 5,
        randomizeDelay: true,
      }));
    }
  };

  // Delete / Clear Terminal Logs
  const handleClearLogs = async () => {
    setIsClearingLogs(true);
    try {
      const res = await fetch('/api/whatsapp/clear-logs', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus((prev) => ({ ...prev, logs: [] }));
      }
    } catch (err: any) {
      console.error('Failed to clear logs:', err);
    } finally {
      setIsClearingLogs(false);
    }
  };

  // Export Contacts to Excel (.xlsx)
  const exportContactsToExcel = (items: ContactRow[], filename: string) => {
    if (!items || items.length === 0) {
      alert('No contacts to export in this category.');
      return;
    }
    const exportData = items.map((c, index) => ({
      'S.No': index + 1,
      'Column 1 (Name / Phone)': c.name || (c.phone ? `+${c.phone}` : 'Client'),
      'Phone Number': c.phone ? `+${c.phone}` : '',
      'Status': c.status.toUpperCase(),
      'Column 2 (Message)': c.message,
      'Sent At': c.sentAt || '',
      'Error Reason': c.error || '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    XLSX.writeFile(workbook, filename);
  };

  // Export Sent List Handler
  const handleExportSentList = () => {
    const sentList = contacts.filter((c) => c.status === 'sent');
    if (sentList.length === 0) {
      alert('No sent messages to export yet.');
      return;
    }
    exportContactsToExcel(sentList, `Sent_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Export Fail List Handler
  const handleExportFailedList = () => {
    const failedList = contacts.filter((c) => c.status === 'failed');
    if (failedList.length === 0) {
      alert('No failed messages to export.');
      return;
    }
    exportContactsToExcel(failedList, `Failed_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Retry Failed Contacts
  const handleRetryFailed = () => {
    const failedContacts = contacts.filter((c) => c.status === 'failed');
    if (failedContacts.length === 0) {
      alert('No failed contacts to retry.');
      return;
    }
    const failedIds = new Set(failedContacts.map((c) => c.id));
    setContacts((prev) =>
      prev.map((c) => (failedIds.has(c.id) ? { ...c, status: 'pending', error: undefined } : c))
    );
    setSelectedIds(failedIds);
    setActiveTab('all');
  };

  // Pause / Resume
  const handleTogglePause = async () => {
    try {
      await fetch('/api/whatsapp/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: status.isPaused ? 'resume' : 'pause' }),
      });
    } catch (err: any) {
      alert('Error toggling pause: ' + err.message);
    }
  };

  // Stop Campaign
  const handleStopCampaign = async () => {
    if (!confirm('Are you sure you want to stop the automation campaign?')) return;
    try {
      await fetch('/api/whatsapp/stop', { method: 'POST' });
    } catch (err: any) {
      alert('Error stopping campaign: ' + err.message);
    }
  };

  // Row selection
  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedContacts.length && displayedContacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedContacts.map((c) => c.id)));
    }
  };

  const deleteContact = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    const next = new Set(selectedIds);
    next.delete(id);
    setSelectedIds(next);
  };

  const clearAllContacts = () => {
    if (confirm('Clear all contacts from list?')) {
      setContacts([]);
      setSelectedIds(new Set());
      setUploadedFileName('');
    }
  };

  // Filtered contacts
  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.group && c.group.toLowerCase().includes(searchQuery.toLowerCase())) ||
      c.message.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesGroup = selectedGroup === 'all' || c.group === selectedGroup;

    return matchesSearch && matchesGroup;
  });

  // Tab-filtered contacts (All, Sent, or Failed)
  const displayedContacts = filteredContacts.filter((c) => {
    if (activeTab === 'sent') return c.status === 'sent';
    if (activeTab === 'failed') return c.status === 'failed';
    return true;
  });

  // Calculate progress %
  const totalCount = contacts.length;
  const sentCount = contacts.filter((c) => c.status === 'sent').length;
  const failedCount = contacts.filter((c) => c.status === 'failed').length;
  const pendingCount = contacts.filter((c) => c.status === 'pending').length;
  const percentComplete = totalCount > 0 ? Math.round(((sentCount + failedCount) / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen pb-16">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#128C7E] to-[#25D366] flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-lg text-slate-900 leading-none">WhatsApp Chrome Automator</h1>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  ⚡ 2-Column Fast Automation
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Column 1: Name or Contact No. | Column 2: Message Text</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Permanent Session Badge */}
            <div className="flex items-center space-x-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-slate-800">
                {status.isLoggedIn ? 'Session Saved & Active' : 'Saved Session Active'}
              </span>
            </div>

            <button
              onClick={handleOpenChrome}
              disabled={isOpeningChrome}
              className="inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors"
              title="Open Google Chrome to WhatsApp Web"
            >
              <Chrome className={`w-4 h-4 text-[#4285F4] ${isOpeningChrome ? 'animate-spin' : ''}`} />
              <span>{isOpeningChrome ? 'Opening...' : 'Open Chrome'}</span>
            </button>

            <button
              onClick={handleRestartChrome}
              disabled={isRestartingChrome}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors"
              title="Reconnect to Chrome"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRestartingChrome ? 'animate-spin' : ''}`} />
              <span>Reconnect</span>
            </button>

            <button
              onClick={handleForceResetChrome}
              disabled={isForceResetting}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
              title="Force terminate stuck Chrome processes and reconnect"
            >
              <Wrench className={`w-3.5 h-3.5 ${isForceResetting ? 'animate-spin' : ''}`} />
              <span>{isForceResetting ? 'Fixing...' : 'Fix Chrome'}</span>
            </button>

            {status.isLoggedIn && (
              <button
                onClick={handleDisconnectSession}
                disabled={isDisconnecting}
                className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-rose-800 bg-rose-100 hover:bg-rose-200 rounded-lg border border-rose-300 transition-colors"
                title="Disconnect & Log out WhatsApp"
              >
                <LogOut className={`w-3.5 h-3.5 ${isDisconnecting ? 'animate-spin' : ''}`} />
                <span>{isDisconnecting ? 'Logging out...' : 'Disconnect WhatsApp'}</span>
              </button>
            )}

            <button
              onClick={downloadSampleTemplate}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Sample 2-Col Excel</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        {/* Device & Google Chrome Download / Status Banner */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Chrome className="w-5 h-5 text-[#4285F4]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-800">Device Requirement: Google Chrome Browser</span>
                {status.chromeInstalled ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ✓ Installed & Ready
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                    ⚠ Chrome Not Found
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Google Chrome must be installed on your computer to run WhatsApp Web automation.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <a
              href="https://www.google.com/chrome/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Download Google Chrome (Free Official)</span>
            </a>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* WHATSAPP LOGIN & QR CODE SECTION                                         */}
        {/* ========================================================================= */}
        <div ref={qrSectionRef}>
          {status.isLoggedIn ? (
            /* When Logged In: Reusing saved session permanently! */
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/15 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-lg font-bold">WhatsApp Session is Saved & Logged In!</h2>
                    <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-700/60 rounded-full border border-emerald-300/30 flex items-center space-x-1">
                      <Unlock className="w-3 h-3" />
                      <span>Ready to Send</span>
                    </span>
                  </div>
                  <p className="text-xs text-emerald-100 mt-1">
                    Your session is saved permanently in Chrome. You do not need to scan QR code again!
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenChrome}
                  className="px-3.5 py-2 text-xs font-semibold bg-white text-emerald-800 rounded-xl hover:bg-emerald-50 transition-colors shadow-sm flex items-center space-x-1.5"
                >
                  <Chrome className="w-4 h-4 text-emerald-600" />
                  <span>View Chrome Window</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectSession}
                  disabled={isDisconnecting}
                  className="px-3.5 py-2 text-xs font-semibold bg-rose-600/90 hover:bg-rose-700 text-white rounded-xl transition-colors shadow-sm flex items-center space-x-1.5 border border-rose-400/30"
                  title="Disconnect & Log out current WhatsApp account"
                >
                  <LogOut className={`w-3.5 h-3.5 ${isDisconnecting ? 'animate-spin' : ''}`} />
                  <span>{isDisconnecting ? 'Disconnecting...' : 'Disconnect WhatsApp'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* When First-Time QR Code Scan is Needed */
            <div className="bg-white border-2 border-amber-400 rounded-2xl p-6 shadow-md shadow-amber-500/10">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                
                {/* Left Column: Instructions */}
                <div className="flex-1 space-y-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm">
                      <Lock className="w-5 h-5 text-amber-700" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                        <span>Scan QR Code (Only Required Once!)</span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                          Permanent Session
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500">
                        Scan this QR code once with your phone. Your session will be saved permanently and reused automatically!
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-700">
                    <div className="flex items-start space-x-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                      <span>Open <strong>WhatsApp</strong> on your mobile phone (Android or iPhone).</span>
                    </div>
                    <div className="flex items-start space-x-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                      <span>Tap <strong>Menu (⋮ 3 dots)</strong> on Android or <strong>Settings (⚙️)</strong> on iPhone.</span>
                    </div>
                    <div className="flex items-start space-x-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                      <span>Tap <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong>.</span>
                    </div>
                    <div className="flex items-start space-x-2.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                      <span>Point your phone camera at the <strong>QR Code on your screen</strong> right here!</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleOpenChrome}
                      disabled={isOpeningChrome}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                    >
                      <Chrome className="w-3.5 h-3.5" />
                      <span>{isOpeningChrome ? 'Opening Chrome...' : 'Open Chrome Window'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRestartChrome}
                      disabled={isRestartingChrome}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRestartingChrome ? 'animate-spin' : ''}`} />
                      <span>Reload QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleForceResetChrome}
                      disabled={isForceResetting}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                      title="Force kill any stuck background Chrome processes and unlock profile"
                    >
                      <Wrench className={`w-3.5 h-3.5 ${isForceResetting ? 'animate-spin' : ''}`} />
                      <span>{isForceResetting ? 'Fixing...' : 'Fix / Unlock Chrome'}</span>
                    </button>

                    <span className="text-[11px] text-slate-400">
                      Session stays saved permanently after scanning
                    </span>
                  </div>
                </div>

                {/* Right Column: Live Captured QR Code Box */}
                <div className="w-full md:w-64 flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-2xl shrink-0 text-center">
                  {status.qrCodeImage ? (
                    <div className="relative group">
                      <img
                        src={status.qrCodeImage}
                        alt="WhatsApp Web QR Code"
                        className="w-52 h-52 object-contain bg-white p-2 rounded-xl border border-slate-300 shadow-sm"
                      />
                      <div className="mt-2 text-[11px] font-semibold text-emerald-700 flex items-center justify-center space-x-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        <span>Scan This QR Code Once</span>
                      </div>
                    </div>
                  ) : (
                    <div className="w-52 h-52 flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-slate-300 p-4">
                      <RotateCw className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
                      <p className="text-xs font-semibold text-slate-700">Connecting to WhatsApp...</p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                        Checking your saved session
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenChrome}
                        className="mt-3 px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 hover:bg-emerald-100"
                      >
                        Click to Open Chrome
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total In List</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{contacts.length}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Selected</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{selectedIds.size}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Sent Successfully</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{sentCount}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-500 uppercase tracking-wider">Failed / Not Found</p>
              <p className="text-2xl font-bold text-rose-600 mt-1">{failedCount}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-500 uppercase tracking-wider">Remaining</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Action Controls & Uploader Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Excel Sheet Uploader */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-900 flex items-center space-x-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>2. Upload 2-Column Excel Sheet</span>
                </h2>
                {uploadedFileName && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium truncate max-w-[150px]">
                    {uploadedFileName}
                  </span>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3 text-xs text-slate-700 space-y-1">
                <p><strong>Column 1:</strong> May be <strong>Contact Name</strong> OR <strong>Contact No.</strong></p>
                <p><strong>Column 2:</strong> <strong>Message Text</strong> to send to client</p>
              </div>

              {/* Drag & Drop Upload Target */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all rounded-xl p-5 text-center cursor-pointer group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-emerald-100 group-hover:text-emerald-600 text-slate-500 mx-auto flex items-center justify-center mb-2 transition-colors">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700">
                  {isUploading ? 'Reading spreadsheet...' : 'Click to browse Excel / CSV'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Supports .xlsx, .xls, .csv</p>
              </div>

              {/* Fast Demo Button */}
              <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-slate-100">
                <span className="text-xs text-slate-500">Need a quick test?</span>
                <button
                  type="button"
                  onClick={loadDemoData}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                >
                  Load Demo 2-Col Data
                </button>
              </div>
            </div>

            {/* Country code helper */}
            <div className="mt-3 pt-2.5 border-t border-slate-100">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Default Country Code (for 10-digit numbers without prefix):
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={settings.defaultCountryCode}
                  onChange={(e) => setSettings({ ...settings, defaultCountryCode: e.target.value })}
                  placeholder="e.g. 91"
                  className="w-24 px-2.5 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-400 self-center">
                  (91 for India, 1 for USA, 44 for UK)
                </span>
              </div>
            </div>
          </div>

          {/* Column 2: Message, Speed & Route Settings */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center space-x-2">
              <Settings2 className="w-5 h-5 text-indigo-600" />
              <span>3. Speed & Sending Mode</span>
            </h2>

            {/* SPEED MODE SELECTOR */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>Delivery Speed:</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSpeedPreset('fast')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    settings.speedMode === 'fast'
                      ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs">⚡ Turbo Fast</span>
                  <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">0.5-1s delay</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSpeedPreset('balanced')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    settings.speedMode === 'balanced'
                      ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs">🚀 Standard</span>
                  <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">1-2s delay</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSpeedPreset('safe')}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    settings.speedMode === 'safe'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs">🛡️ Safe</span>
                  <span className="text-[10px] text-slate-500 block leading-tight mt-0.5">3-5s delay</span>
                </button>
              </div>
            </div>

            {/* Target Route Choice (Send via Name or No.) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-700 block">
                Column 1 Detection Mode:
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, preferredMode: 'auto' })}
                  className={`p-1.5 rounded-lg border text-center transition-all ${
                    settings.preferredMode === 'auto'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs">⚡ Auto-Detect</span>
                  <span className="text-[10px] text-slate-500 block leading-tight">Name or Number</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, preferredMode: 'name_only' })}
                  className={`p-1.5 rounded-lg border text-center transition-all ${
                    settings.preferredMode === 'name_only'
                      ? 'border-purple-500 bg-purple-50 text-purple-800 font-semibold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs">👤 By Name</span>
                  <span className="text-[10px] text-slate-500 block leading-tight">Search Name</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, preferredMode: 'phone_only' })}
                  className={`p-1.5 rounded-lg border text-center transition-all ${
                    settings.preferredMode === 'phone_only'
                      ? 'border-blue-500 bg-blue-50 text-blue-800 font-semibold shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs">📞 Phone No.</span>
                  <span className="text-[10px] text-slate-500 block leading-tight">By Number</span>
                </button>
              </div>
            </div>

            {/* Custom template toggle */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Message Source</label>
                <label className="flex items-center space-x-1.5 text-xs cursor-pointer text-slate-600">
                  <input
                    type="checkbox"
                    checked={useCustomTemplate}
                    onChange={(e) => setUseCustomTemplate(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                  />
                  <span>Override sheet text</span>
                </label>
              </div>

              {useCustomTemplate ? (
                <div className="space-y-1.5">
                  <textarea
                    rows={2}
                    value={customTemplate}
                    onChange={(e) => setCustomTemplate(e.target.value)}
                    placeholder="Hello {name}, greetings!"
                    className="w-full p-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none font-mono"
                  />
                  <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
                    <span>Tags:</span>
                    <button
                      type="button"
                      onClick={() => setCustomTemplate((prev) => prev + ' {name}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-mono"
                    >
                      {'{name}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomTemplate((prev) => prev + ' {phone}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-mono"
                    >
                      {'{phone}'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  Column 2 message text from your Excel sheet will be sent to each client.
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Chrome Execution & PRE-CHECK SEND BUTTON */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-900 flex items-center space-x-2">
                  <Play className="w-5 h-5 text-emerald-600" />
                  <span>4. Launch Automation</span>
                </h2>

                {/* Login Status Pill */}
                {status.isLoggedIn ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>WhatsApp Ready</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>Scan QR First</span>
                  </span>
                )}
              </div>

              {/* Current Status Box */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600">Automation Status</span>
                  {status.isRunning ? (
                    <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Sending Messages...</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                      <span>Idle / Ready</span>
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden mb-1.5">
                  <div
                    className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${percentComplete}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Progress: {percentComplete}%</span>
                  <span>
                    {sentCount + failedCount} / {totalCount} contacts
                  </span>
                </div>

                {status.currentContact && (
                  <div className="mt-2 text-xs text-slate-700 border-t border-slate-200 pt-2 truncate">
                    <span className="font-medium text-emerald-700">Active: </span>
                    {status.currentContact.name} ({status.currentContact.phone || status.currentContact.group})
                  </div>
                )}
              </div>
            </div>

            {/* SEND BUTTON WITH PRE-FLIGHT LOGIN VERIFICATION */}
            <div className="space-y-2">
              {!status.isRunning ? (
                status.isLoggedIn ? (
                  /* When Logged In: Big Fast Send Button */
                  <button
                    type="button"
                    onClick={handleStartCampaign}
                    disabled={selectedIds.size === 0}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4 fill-current text-amber-300" />
                    <span>Start Fast Automation ({selectedIds.size})</span>
                  </button>
                ) : (
                  /* When NOT Logged In: Warn & Guide to QR Code */
                  <button
                    type="button"
                    onClick={handleStartCampaign}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-xs shadow-md shadow-amber-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer animate-pulse"
                    title="Please scan the QR code first before starting"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Scan QR Code to Send ({selectedIds.size} ready)</span>
                  </button>
                )
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all"
                  >
                    <Pause className="w-4 h-4" />
                    <span>{status.isPaused ? 'Resume' : 'Pause'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStopCampaign}
                    className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop</span>
                  </button>
                </div>
              )}

              <p className="text-[11px] text-center text-slate-400">
                {status.isLoggedIn
                  ? '⚡ Turbo Fast message dispatch active (0.5-1s delay)'
                  : '⚠️ WhatsApp login session must be running before sending'}
              </p>
            </div>
          </div>
        </div>

        {/* Live Execution Logs Console */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-md overflow-hidden">
          <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
              </div>
              <span className="text-xs font-mono text-slate-400 ml-2">Chrome Automation Terminal & Live Logs</span>
            </div>

            <div className="flex items-center space-x-3">
              {status.isRunning && (
                <span className="text-xs text-amber-400 font-mono animate-pulse flex items-center space-x-1 font-semibold">
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Turbo Fast Active</span>
                </span>
              )}
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearingLogs || status.logs.length === 0}
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded border border-slate-700 transition-colors cursor-pointer"
                title="Delete Terminal Logs"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>{isClearingLogs ? 'Deleting...' : 'Delete Logs'}</span>
              </button>
            </div>
          </div>

          <div
            ref={logTerminalRef}
            className="p-4 h-48 overflow-y-auto font-mono text-xs space-y-1.5 bg-slate-900/90 text-slate-200"
          >
            {status.logs.length === 0 ? (
              <div className="text-slate-500 text-center py-6">
                No automation logs yet. Upload an Excel sheet and click "Start Fast Automation" to begin.
              </div>
            ) : (
              status.logs.map((log) => {
                let badgeClass = 'text-sky-400';
                if (log.type === 'success') badgeClass = 'text-emerald-400 font-semibold';
                if (log.type === 'warning') badgeClass = 'text-amber-400 font-semibold';
                if (log.type === 'error') badgeClass = 'text-rose-400 font-semibold';

                return (
                  <div key={log.id} className="flex space-x-2 leading-relaxed">
                    <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                    <span className={`uppercase text-[10px] px-1 py-0.2 rounded ${badgeClass}`}>
                      [{log.type}]
                    </span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Campaign Completion Summary Banner */}
        {!status.isRunning && (sentCount > 0 || failedCount > 0) && (
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Campaign Completed!</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  <span className="font-semibold text-emerald-700">{sentCount} Sent</span>
                  {failedCount > 0 && (
                    <>
                      {' • '}
                      <span className="font-semibold text-rose-600">{failedCount} Failed</span>
                    </>
                  )}
                  {pendingCount > 0 && (
                    <>
                      {' • '}
                      <span className="font-semibold text-slate-500">{pendingCount} Pending</span>
                    </>
                  )}
                  {' • '}
                  Download your reports or retry failed contacts below:
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 w-full md:w-auto">
              {sentCount > 0 && (
                <button
                  type="button"
                  onClick={handleExportSentList}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download Sent List ({sentCount})</span>
                </button>
              )}

              {failedCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleExportFailedList}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Download Fail List ({failedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Failed ({failedCount})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Contacts Table & Preview Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table Header Controls */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <h2 className="font-semibold text-slate-900 text-base">
                {activeTab === 'all' && `All Contacts (${contacts.length})`}
                {activeTab === 'sent' && `Sent List (${sentCount})`}
                {activeTab === 'failed' && `Fail List (${failedCount})`}
              </h2>
              {contacts.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllContacts}
                  className="text-xs text-rose-600 hover:text-rose-800 hover:underline flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Result Tabs & Quick Export Toolbar */}
          <div className="px-4 pt-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1.5 ${
                  activeTab === 'all'
                    ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>All Contacts</span>
                <span className="px-1.5 py-0.2 text-[10px] bg-slate-200 text-slate-700 rounded-full font-bold">
                  {contacts.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sent')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1.5 ${
                  activeTab === 'sent'
                    ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Sent List</span>
                <span className="px-1.5 py-0.2 text-[10px] bg-emerald-100 text-emerald-800 rounded-full font-bold">
                  {sentCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('failed')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all flex items-center space-x-1.5 ${
                  activeTab === 'failed'
                    ? 'border-rose-600 text-rose-700 bg-white rounded-t-lg'
                    : 'border-transparent text-slate-500 hover:text-rose-700'
                }`}
              >
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                <span>Fail List</span>
                <span className="px-1.5 py-0.2 text-[10px] bg-rose-100 text-rose-800 rounded-full font-bold">
                  {failedCount}
                </span>
              </button>
            </div>

            {/* Quick Export & Retry Buttons */}
            <div className="flex items-center space-x-2 pb-2 sm:pb-1 flex-wrap">
              {sentCount > 0 && (
                <button
                  type="button"
                  onClick={handleExportSentList}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  title="Export sent contacts to Excel"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Sent ({sentCount})</span>
                </button>
              )}

              {failedCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleExportFailedList}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    title="Export failed contacts to Excel"
                  >
                    <FileDown className="w-3.5 h-3.5 text-rose-600" />
                    <span>Download Fail ({failedCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-white hover:bg-amber-50 border border-amber-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    title="Retry sending to failed contacts"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                    <span>Retry Failed</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={displayedContacts.length > 0 && selectedIds.size === displayedContacts.length}
                      onChange={toggleSelectAll}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                    />
                  </th>
                  <th className="p-3">Column 1: Client Target</th>
                  <th className="p-3">Detected Method</th>
                  <th className="p-3 w-2/5">Column 2: Message Text</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedContacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-medium text-slate-600">
                        {activeTab === 'sent' && 'No sent contacts yet'}
                        {activeTab === 'failed' && 'No failed contacts found'}
                        {activeTab === 'all' && 'No contacts loaded yet'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {activeTab === 'sent' && 'Messages sent successfully will appear here.'}
                        {activeTab === 'failed' && 'Any contacts that could not be delivered will appear here.'}
                        {activeTab === 'all' && 'Upload a 2-column Excel file (.xlsx, .csv) or click "Load Demo 2-Col Data" above.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedContacts.map((contact) => {
                    const isSelected = selectedIds.has(contact.id);
                    const hasPhone = Boolean(contact.phone && contact.phone.trim().length >= 7);

                    return (
                      <tr
                        key={contact.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          contact.status === 'sending' ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(contact.id)}
                            className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-medium text-slate-900">
                          {contact.name || (contact.phone ? `+${contact.phone}` : 'Client')}
                        </td>
                        <td className="p-3">
                          {hasPhone ? (
                            <span className="inline-flex items-center space-x-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-mono text-[11px]">
                              <PhoneCall className="w-3 h-3" />
                              <span>Direct No. (+{contact.phone})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px] font-medium">
                              <UserCheck className="w-3 h-3" />
                              <span>Search Name: "{contact.name}"</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate" title={contact.message}>
                          {contact.message}
                        </td>
                        <td className="p-3">
                          {contact.status === 'pending' && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <Clock className="w-3 h-3" />
                              <span>Pending</span>
                            </span>
                          )}
                          {contact.status === 'sending' && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200 animate-pulse font-semibold">
                              <Zap className="w-3 h-3 text-amber-600 fill-amber-600 animate-bounce" />
                              <span>Sending Fast...</span>
                            </span>
                          )}
                          {contact.status === 'sent' && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Sent {contact.sentAt ? `(${contact.sentAt})` : ''}</span>
                            </span>
                          )}
                          {contact.status === 'failed' && (
                            <span
                              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800 border border-rose-200"
                              title={contact.error}
                            >
                              <XCircle className="w-3 h-3" />
                              <span>Failed</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => deleteContact(contact.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
