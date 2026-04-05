import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import api from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import {
  Shield, AlertTriangle, FileText, ChefHat, ShoppingBag,
  Ban, Pencil, CheckCircle2, Wifi, QrCode, Clock, User, Filter
} from 'lucide-react';

const ACTION_CONFIG = {
  order_created:    { label: 'Order Created',    icon: ShoppingBag,  color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  order_edited:     { label: 'Order Edited',     icon: Pencil,       color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  order_completed:  { label: 'Order Completed',  icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  order_cancelled:  { label: 'Order Cancelled',  icon: Ban,          color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
  order_voided:     { label: 'Order Voided',     icon: AlertTriangle,color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-300' },
  item_removed:     { label: 'Item Removed',     icon: Ban,          color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  kds_acknowledged: { label: 'KDS Acknowledged', icon: ChefHat,      color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  kds_preparing:    { label: 'KDS Preparing',    icon: ChefHat,      color: 'text-yellow-600',  bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  kds_ready:        { label: 'KDS Ready',        icon: ChefHat,      color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  offline_sync:     { label: 'Offline Sync',     icon: Wifi,         color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  qr_order:         { label: 'QR Order',         icon: QrCode,       color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200' },
};

const getActionConfig = (action) => ACTION_CONFIG[action] || {
  label: action?.replace(/_/g, ' ') || 'Unknown',
  icon: FileText,
  color: 'text-slate-600',
  bg: 'bg-slate-50',
  border: 'border-slate-200',
};

const formatTime = (iso) => {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
};

const formatDate = (iso) => {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return iso; }
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(0);
  const LIMIT = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter !== 'all') params.append('action', actionFilter);
      params.append('limit', LIMIT);
      params.append('skip', page * LIMIT);
      const [logsRes, summaryRes] = await Promise.all([
        api.get(`/audit/logs?${params.toString()}`),
        api.get('/audit/logs/summary'),
      ]);
      setLogs(logsRes.data.logs);
      setTotal(logsRes.data.total);
      setSummary(summaryRes.data);
    } catch (err) {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const uniqueActions = [...new Set(logs.map(l => l.action))].sort();
  const voidCount = summary?.action_counts?.order_cancelled || 0;
  const editCount = summary?.action_counts?.order_edited || 0;
  const totalToday = summary?.total_events_today || 0;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50/50">
      <Sidebar />
      <div className="flex-1 min-w-0 p-4 md:p-8 pt-16 md:pt-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-7 h-7 text-red-500" />
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight" data-testid="audit-heading">Audit Log</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Every cancellation, edit, and void is recorded. Nobody escapes the log.
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card data-testid="audit-total-events">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Events Today</p>
                <p className="text-2xl font-bold font-mono">{totalToday}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200" data-testid="audit-voids-count">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-red-600 uppercase tracking-wider">Cancellations</p>
                  <Ban className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold font-mono text-red-600">{voidCount}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200" data-testid="audit-edits-count">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Edits</p>
                  <Pencil className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-2xl font-bold font-mono text-amber-600">{editCount}</p>
              </CardContent>
            </Card>
            <Card data-testid="audit-top-actor">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top Actor</p>
                  <User className="w-4 h-4 text-slate-500" />
                </div>
                <p className="text-lg font-bold truncate">
                  {summary?.top_actors?.[0]?.user || '--'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {summary?.top_actors?.[0]?.actions || 0} actions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter:</span>
            </div>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
              <SelectTrigger className="w-48" data-testid="audit-action-filter">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="order_cancelled">Cancellations</SelectItem>
                <SelectItem value="order_edited">Edits</SelectItem>
                <SelectItem value="order_completed">Completions</SelectItem>
                <SelectItem value="order_created">Creations</SelectItem>
                <SelectItem value="kds_acknowledged">KDS Acknowledged</SelectItem>
                <SelectItem value="kds_preparing">KDS Preparing</SelectItem>
                <SelectItem value="kds_ready">KDS Ready</SelectItem>
                <SelectItem value="offline_sync">Offline Syncs</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {total} event{total !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Log Entries */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading audit trail...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="audit-empty">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No audit events found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const cfg = getActionConfig(log.action);
                const IconComp = cfg.icon;
                const isCritical = ['order_cancelled', 'order_voided', 'item_removed'].includes(log.action);

                return (
                  <div
                    key={log.id}
                    data-testid={`audit-entry-${log.id}`}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                      isCritical ? 'bg-red-50/50 border-red-200 hover:bg-red-50' : `${cfg.bg} ${cfg.border} hover:opacity-90`
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <IconComp className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</span>
                        {log.order_number && (
                          <span className="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                            #{String(log.order_number).padStart(3, '0')}
                          </span>
                        )}
                        {isCritical && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold uppercase">Security</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <strong>{log.performed_by}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(log.created_at)} {formatTime(log.created_at)}
                        </span>
                      </div>
                      {/* Details */}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {log.details.void_category && (
                            <p className="text-red-700 font-semibold">
                              <span className="inline-block bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold mr-1">{log.details.void_category.replace(/_/g, ' ')}</span>
                              {log.details.void_note && <span className="font-normal text-red-600">{log.details.void_note}</span>}
                            </p>
                          )}
                          {!log.details.void_category && log.details.reason && (
                            <p className="text-red-600 font-semibold">Reason: {log.details.reason}</p>
                          )}
                          {log.details.manager_approved_by && (
                            <p className="text-amber-700 font-semibold mt-0.5">Manager override: {log.details.manager_approved_by}</p>
                          )}
                          {log.details.original_total !== undefined && (
                            <p>Original total: <strong>{log.details.original_total?.toFixed?.(2) || log.details.original_total}</strong></p>
                          )}
                          {log.details.payment_method && (
                            <p>Payment: <strong>{log.details.payment_method}</strong> | Total: <strong>{log.details.total?.toFixed?.(2)}</strong></p>
                          )}
                          {log.details.old_total !== undefined && log.details.new_total !== undefined && (
                            <p>Total changed: {log.details.old_total?.toFixed?.(2)} &rarr; {log.details.new_total?.toFixed?.(2)}</p>
                          )}
                          {log.details.removed_items && log.details.removed_items.length > 0 && (
                            <p>Removed: {log.details.removed_items.join(', ')}</p>
                          )}
                          {log.details.items && log.details.items.length > 0 && log.action === 'order_cancelled' && (
                            <div className="mt-1 pl-2 border-l-2 border-red-200">
                              {log.details.items.map((item, idx) => (
                                <p key={idx}>{item.qty}x {item.name}</p>
                              ))}
                            </div>
                          )}
                          {log.details.synced !== undefined && (
                            <p>Synced: {log.details.synced} orders (errors: {log.details.errors})</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {Math.ceil(total / LIMIT)}
              </span>
              <Button variant="outline" size="sm" disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
