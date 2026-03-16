/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Download, Mail, RefreshCw, FileText, FileSpreadsheet, Send, Search, Calendar, User, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [formats, setFormats] = useState(['pdf', 'csv']);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // Assistant state
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<{role: 'user' | 'assistant', text: string}[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkConnection();
    fetchHistory();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'QB_AUTH_SUCCESS') {
        checkConnection();
        showToast('success', 'QuickBooks connected successfully!');
      }
    };
    window.addEventListener('message', handleMessage);
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (connected) {
      fetchAllProjects();
    }
  }, [connected]);

  useEffect(() => {
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      setFilteredProjects(allProjects.filter(p => p.name.toLowerCase().includes(lowerQuery)));
    } else {
      setFilteredProjects(allProjects);
    }
  }, [searchQuery, allProjects]);

  const checkConnection = async () => {
    try {
      const res = await fetch('/api/qb/status');
      const data = await res.json();
      setConnected(data.connected);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllProjects = async () => {
    try {
      const res = await fetch(`/api/qb/projects`);
      const data = await res.json();
      setAllProjects(data);
      setFilteredProjects(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/reports/history');
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      } else {
        console.error('Failed to fetch history:', data.error);
        setHistory([]);
      }
    } catch (err) {
      console.error(err);
      setHistory([]);
    }
  };

  const handleConnect = () => {
    const origin = window.location.origin;
    const authWindow = window.open(
      `${origin}/api/qb/auth`,
      'oauth_popup',
      'width=600,height=700'
    );
    if (!authWindow) {
      showToast('error', 'Please allow popups to connect QuickBooks.');
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const handleGenerate = async () => {
    if (!selectedProject && !startDate && !endDate) {
      showToast('error', 'Please select at least a project or date range.');
      return;
    }
    if (!recipientEmail) {
      showToast('error', 'Please enter a recipient email.');
      return;
    }

    setGenerating(true);
    try {
      const filters = {
        customerRef: selectedProject?.id,
        projectName: selectedProject?.name,
        startDate,
        endDate
      };

      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, recipientEmail, formats })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');

      showToast('success', 'Report generated and emailed successfully!');
      fetchHistory();
      
      // Trigger downloads if requested
      if (formats.includes('pdf') && data.pdfBase64) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${data.pdfBase64}`;
        link.download = `Project_Hours_${selectedProject?.name || 'Report'}.pdf`;
        link.click();
      }
      if (formats.includes('csv') && data.csvData) {
        const link = document.createElement('a');
        link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(data.csvData)}`;
        link.download = `Project_Hours_${selectedProject?.name || 'Report'}.csv`;
        link.click();
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAssistantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistantQuery.trim()) return;

    const newMessages = [...assistantMessages, { role: 'user' as const, text: assistantQuery }];
    setAssistantMessages(newMessages);
    setAssistantQuery('');
    setAssistantLoading(true);

    try {
      const prompt = `
        You are an assistant for a QuickBooks Project Hours Reporter app.
        Extract the following filters from the user's request:
        - projectName (string)
        - startDate (YYYY-MM-DD)
        - endDate (YYYY-MM-DD)
        - recipientEmail (string)
        
        Current Date: ${new Date().toISOString().split('T')[0]}
        
        User request: "${newMessages[newMessages.length - 1].text}"
        
        Return ONLY a JSON object with these keys. If a value is not found, leave it null.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const filters = JSON.parse(response.text || '{}');
      
      let reply = 'I have updated the form based on your request:\n';
      if (filters.projectName) {
        setSearchQuery(filters.projectName);
        reply += `- Project: ${filters.projectName}\n`;
      }
      if (filters.startDate) {
        setStartDate(filters.startDate);
        reply += `- Start Date: ${filters.startDate}\n`;
      }
      if (filters.endDate) {
        setEndDate(filters.endDate);
        reply += `- End Date: ${filters.endDate}\n`;
      }
      if (filters.recipientEmail) {
        setRecipientEmail(filters.recipientEmail);
        reply += `- Email: ${filters.recipientEmail}\n`;
      }

      reply += '\nPlease review the form and click "Generate and Send Report" when ready.';
      
      setAssistantMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      console.error(err);
      setAssistantMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I encountered an error parsing your request.' }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><RefreshCw className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-800">QuickBooks Project Hours Reporter</h1>
        </div>
        <div className="flex items-center gap-4">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
              Connected to QuickBooks
            </span>
          ) : (
            <button
              onClick={handleConnect}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Connect QuickBooks
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-slate-400" />
              Report Configuration
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Project Search */}
              <div className="col-span-full" ref={dropdownRef}>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project / Customer</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedProject(null);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="Search projects..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={!connected}
                  />
                  <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                  
                  {isDropdownOpen && connected && (
                    <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                      {filteredProjects.length > 0 ? (
                        filteredProjects.map((p: any) => (
                          <li
                            key={p.id}
                            onClick={() => {
                              setSelectedProject(p);
                              setSearchQuery(p.name);
                              setIsDropdownOpen(false);
                            }}
                            className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm"
                          >
                            {p.name}
                          </li>
                        ))
                      ) : (
                        <li className="px-4 py-2 text-slate-500 text-sm">No projects found.</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <Calendar className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              {/* Email */}
              <div className="col-span-full">
                <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Email</label>
                <div className="relative">
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="manager@example.com"
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              {/* Formats */}
              <div className="col-span-full">
                <label className="block text-sm font-medium text-slate-700 mb-2">Output Formats</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formats.includes('pdf')}
                      onChange={(e) => {
                        if (e.target.checked) setFormats([...formats, 'pdf']);
                        else setFormats(formats.filter(f => f !== 'pdf'));
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="text-sm">PDF Summary</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formats.includes('csv')}
                      onChange={(e) => {
                        if (e.target.checked) setFormats([...formats, 'csv']);
                        else setFormats(formats.filter(f => f !== 'csv'));
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                    <span className="text-sm">CSV Details</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={!connected || generating}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-md transition-colors shadow-sm"
              >
                {generating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                Generate and Send Report
              </button>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Reports</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Filters</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No reports generated yet.</td>
                    </tr>
                  ) : (
                    history.map((item: any) => {
                      const filters = JSON.parse(item.filters || '{}');
                      return (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 whitespace-nowrap">{new Date(item.requested_at).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {filters.projectName && <span className="text-xs font-medium text-slate-700">{filters.projectName}</span>}
                              <span className="text-xs text-slate-500">{filters.startDate || 'Any'} to {filters.endDate || 'Any'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.recipient_email}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              item.status === 'Success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Assistant */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-[600px] flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-slate-800">AI Assistant</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-indigo-50 text-indigo-900 p-3 rounded-lg rounded-tl-none text-sm">
                Hi! I can help you fill out the report form. Try asking: <br/><br/>
                "Generate a report for Project Alpha from Jan 1 to Jan 31 and send it to boss@example.com"
              </div>
              
              {assistantMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-lg text-sm whitespace-pre-wrap ${
                    msg.role === 'user' 
                      ? 'bg-slate-800 text-white rounded-tr-none' 
                      : 'bg-indigo-50 text-indigo-900 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {assistantLoading && (
                <div className="flex justify-start">
                  <div className="bg-indigo-50 text-indigo-900 p-3 rounded-lg rounded-tl-none text-sm flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Thinking...
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200">
              <form onSubmit={handleAssistantSubmit} className="relative">
                <input
                  type="text"
                  value={assistantQuery}
                  onChange={(e) => setAssistantQuery(e.target.value)}
                  placeholder="Ask me to set up a report..."
                  className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  disabled={assistantLoading}
                />
                <button 
                  type="submit"
                  disabled={assistantLoading || !assistantQuery.trim()}
                  className="absolute right-2 top-1.5 p-1 text-indigo-600 hover:bg-indigo-50 rounded-full disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}

