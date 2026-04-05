import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Search, ShoppingCart, LayoutDashboard, ChefHat, FileText, Settings,
  Table2, Wallet, Users, ArrowRight, BarChart3, Keyboard
} from 'lucide-react';

const ADMIN_COMMANDS = [
  { id: 'pos', label: 'POS Terminal', description: 'Open point of sale', icon: ShoppingCart, path: '/pos', keywords: ['pos', 'sell', 'order', 'terminal'] },
  { id: 'dashboard', label: 'Dashboard', description: 'View analytics', icon: LayoutDashboard, path: '/dashboard', keywords: ['dashboard', 'analytics', 'home', 'stats'] },
  { id: 'kds', label: 'Kitchen Display', description: 'Kitchen order view', icon: ChefHat, path: '/kds', keywords: ['kitchen', 'kds', 'cook', 'display'] },
  { id: 'orders', label: 'Order History', description: 'Browse all orders', icon: FileText, path: '/orders', keywords: ['orders', 'history', 'past'] },
  { id: 'reports', label: 'Reports', description: 'Sales & analytics', icon: BarChart3, path: '/reports', keywords: ['reports', 'sales', 'revenue', 'pdf'] },
  { id: 'tables', label: 'Table Management', description: 'Manage tables & QR', icon: Table2, path: '/tables', keywords: ['tables', 'table', 'qr', 'seating'] },
  { id: 'settings', label: 'Settings', description: 'Restaurant config', icon: Settings, path: '/settings', keywords: ['settings', 'config', 'business', 'printer', 'stripe'] },
  { id: 'cash', label: 'Cash Drawer', description: 'Open/close drawer', icon: Wallet, path: '/cash-drawer', keywords: ['cash', 'drawer', 'money', 'float'] },
  { id: 'staff', label: 'Staff Management', description: 'Manage users', icon: Users, path: '/settings', keywords: ['staff', 'user', 'employee', 'team'] },
  { id: 'menu', label: 'Menu Management', description: 'Products & categories', icon: FileText, path: '/menu', keywords: ['menu', 'product', 'category', 'item', 'price'] },
];

const STAFF_COMMANDS = [
  { id: 'pos', label: 'POS Terminal', description: 'Open point of sale', icon: ShoppingCart, path: '/pos', keywords: ['pos', 'sell', 'order'] },
  { id: 'kds', label: 'Kitchen Display', description: 'Kitchen order view', icon: ChefHat, path: '/kds', keywords: ['kitchen', 'kds'] },
  { id: 'orders', label: 'Order History', description: 'Browse orders', icon: FileText, path: '/orders', keywords: ['orders', 'history'] },
  { id: 'cash', label: 'Cash Drawer', description: 'Open/close drawer', icon: Wallet, path: '/cash-drawer', keywords: ['cash', 'drawer'] },
];

export default function CommandSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const commands = user?.role === 'admin' ? ADMIN_COMMANDS : STAFF_COMMANDS;
  
  const filtered = query.trim()
    ? commands.filter(cmd =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.description.toLowerCase().includes(query.toLowerCase()) ||
        cmd.keywords.some(k => k.includes(query.toLowerCase()))
      )
    : commands;

  const handleSelect = useCallback((cmd) => {
    navigate(cmd.path);
    onClose();
    setQuery('');
  }, [navigate, onClose]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    setQuery('');
    setSelectedIndex(0);
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' && filtered[selectedIndex]) { handleSelect(filtered[selectedIndex]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, filtered, selectedIndex, handleSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="cmdk-overlay" onClick={onClose} data-testid="command-search-overlay">
      <div className="cmdk-modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ animation: 'scale-in 0.15s ease-out' }}>
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 text-base font-medium bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
            data-testid="command-search-input"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 bg-slate-100 rounded-md border border-slate-200">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto p-2 scrollbar-thin" data-testid="command-search-results">
          <div className="px-3 py-2">
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400">
              {query ? 'Results' : 'Quick Navigation'}
            </span>
          </div>
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No results for "{query}"</div>
          )}
          {filtered.map((cmd, idx) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                onClick={() => handleSelect(cmd)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-100 ${
                  idx === selectedIndex
                    ? 'bg-indigo-50 text-indigo-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                data-testid={`command-item-${cmd.id}`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  idx === selectedIndex ? 'bg-indigo-100' : 'bg-slate-100'
                }`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{cmd.label}</div>
                  <div className="text-xs text-slate-400 truncate">{cmd.description}</div>
                </div>
                <ArrowRight className={`w-4 h-4 flex-shrink-0 transition-opacity ${idx === selectedIndex ? 'opacity-100 text-indigo-500' : 'opacity-0'}`} />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Keyboard className="w-3.5 h-3.5" />
            <kbd className="px-1.5 py-0.5 font-mono bg-white rounded border border-slate-200 text-[10px]">Enter</kbd>
            <span>select</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <kbd className="px-1.5 py-0.5 font-mono bg-white rounded border border-slate-200 text-[10px]">Esc</kbd>
            <span>close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
