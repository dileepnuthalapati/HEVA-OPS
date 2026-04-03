import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { AlertTriangle, Lock, Ban, RefreshCw, ChefHat, FlaskConical, PackageX } from 'lucide-react';

const VOID_CATEGORIES = [
  { id: 'mispunch', label: 'Mispunch', icon: Ban, color: 'bg-orange-500 hover:bg-orange-600' },
  { id: 'customer_change', label: 'Customer Change', icon: RefreshCw, color: 'bg-blue-500 hover:bg-blue-600' },
  { id: 'kitchen_error', label: 'Kitchen Error', icon: ChefHat, color: 'bg-red-500 hover:bg-red-600' },
  { id: 'testing', label: 'Testing', icon: FlaskConical, color: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'out_of_stock', label: 'Out of Stock', icon: PackageX, color: 'bg-zinc-600 hover:bg-zinc-700' },
];

const VoidReasonModal = ({ open, onClose, onConfirm, userRole, orderNumber }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [freeText, setFreeText] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isStaff = userRole === 'user';

  const resetAndClose = () => {
    setSelectedCategory(null);
    setFreeText('');
    setManagerPin('');
    setPinError('');
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedCategory) return;
    if (isStaff && !managerPin.trim()) {
      setPinError('Manager PIN is required');
      return;
    }
    setSubmitting(true);
    setPinError('');

    const payload = {
      cancel_reason: freeText ? `${selectedCategory}: ${freeText}` : selectedCategory,
      void_category: selectedCategory,
      void_note: freeText.slice(0, 100),
    };
    if (isStaff) {
      payload.manager_pin = managerPin;
    }

    try {
      await onConfirm(payload);
      resetAndClose();
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed';
      if (detail.toLowerCase().includes('pin') || detail.toLowerCase().includes('manager')) {
        setPinError(detail);
      }
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden" data-testid="void-reason-modal">
        {/* Header */}
        <div className="bg-red-600 px-5 py-4 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5" />
              Void Order {orderNumber ? `#${orderNumber}` : ''}
            </DialogTitle>
            <DialogDescription className="text-red-100 text-sm mt-1">
              Select a reason. This action is permanent and will be logged.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* Quick-tap reason buttons */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Why is this order being voided?</p>
            <div className="grid grid-cols-2 gap-2">
              {VOID_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    data-testid={`void-reason-${cat.id}`}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-semibold text-white transition-all ${
                      isSelected ? `${cat.color} ring-2 ring-offset-2 ring-black scale-[1.02]` : `${cat.color} opacity-70`
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Free text note */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Additional note (optional)</p>
            <Textarea
              data-testid="void-free-text"
              placeholder="e.g. Customer asked to remove 2 items..."
              value={freeText}
              onChange={(e) => setFreeText(e.target.value.slice(0, 100))}
              rows={2}
              className="resize-none text-sm"
            />
            <p className="text-xs text-muted-foreground text-right mt-0.5">{freeText.length}/100</p>
          </div>

          {/* Manager PIN — only for staff */}
          {isStaff && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">Manager Authorization Required</p>
              </div>
              <Input
                data-testid="manager-pin-input"
                type="password"
                placeholder="Enter manager password"
                value={managerPin}
                onChange={(e) => { setManagerPin(e.target.value); setPinError(''); }}
                className="bg-white"
              />
              {pinError && (
                <p className="text-xs text-red-600 mt-1" data-testid="pin-error">{pinError}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={resetAndClose} data-testid="void-cancel-btn">
              Back
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              data-testid="void-confirm-btn"
              onClick={handleSubmit}
              disabled={!selectedCategory || submitting}
            >
              {submitting ? 'Voiding...' : 'Confirm Void'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoidReasonModal;
