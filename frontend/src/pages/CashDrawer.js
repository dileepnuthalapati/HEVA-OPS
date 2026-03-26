import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { cashDrawerAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';

const CashDrawer = () => {
  const [currentDrawer, setCurrentDrawer] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [drawerHistory] = await Promise.all([
        cashDrawerAPI.getHistory(),
      ]);
      setHistory(drawerHistory);
      
      // Try to get current drawer
      try {
        const current = await cashDrawerAPI.getCurrent();
        setCurrentDrawer(current);
      } catch (error) {
        // No open drawer today
        setCurrentDrawer(null);
      }
    } catch (error) {
      toast.error('Failed to load cash drawer data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrawer = async () => {
    if (!openingBalance || parseFloat(openingBalance) < 0) {
      toast.error('Please enter a valid opening balance');
      return;
    }

    try {
      await cashDrawerAPI.open(parseFloat(openingBalance));
      toast.success('Cash drawer opened successfully');
      setShowOpenDialog(false);
      setOpeningBalance('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to open cash drawer');
    }
  };

  const handleCloseDrawer = async () => {
    if (!actualCash || parseFloat(actualCash) < 0) {
      toast.error('Please enter a valid cash amount');
      return;
    }

    try {
      await cashDrawerAPI.close(parseFloat(actualCash), notes);
      toast.success('Cash drawer closed successfully');
      setShowCloseDialog(false);
      setActualCash('');
      setNotes('');
      loadData();
    } catch (error) {
      toast.error('Failed to close cash drawer');
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Cash Drawer</h1>
              <p className="text-muted-foreground">Daily cash reconciliation and management</p>
            </div>
            {!currentDrawer && (
              <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="open-drawer-button">
                    <Wallet className="w-4 h-4 mr-2" />
                    Open Cash Drawer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Open Cash Drawer</DialogTitle>
                    <DialogDescription>Enter the starting cash amount for today</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="opening-balance">Opening Balance ($)</Label>
                      <Input
                        id="opening-balance"
                        data-testid="opening-balance-input"
                        type="number"
                        step="0.01"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        placeholder="0.00"
                        className="h-12 text-lg font-mono"
                      />
                    </div>
                    <Button
                      onClick={handleOpenDrawer}
                      data-testid="confirm-open-button"
                      className="w-full h-12"
                    >
                      Open Drawer
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Current Drawer Status */}
          {currentDrawer ? (
            <div className="mb-8">
              <Card data-testid="current-drawer-card">
                <CardHeader>
                  <CardTitle className="text-2xl font-semibold">Today's Cash Drawer</CardTitle>
                  <CardDescription>
                    Opened at {new Date(currentDrawer.opened_at).toLocaleTimeString()} by {currentDrawer.opened_by}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-2">Opening Balance</div>
                      <div className="text-2xl font-bold font-mono">
                        ${currentDrawer.opening_balance.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-2">Cash Sales Today</div>
                      <div className="text-2xl font-bold font-mono text-emerald-600">
                        +${(currentDrawer.expected_cash - currentDrawer.opening_balance).toFixed(2)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-2">Expected Cash</div>
                      <div className="text-2xl font-bold font-mono text-blue-600">
                        ${currentDrawer.expected_cash.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  
                  <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-12" data-testid="close-drawer-button">
                        Close Cash Drawer
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Close Cash Drawer</DialogTitle>
                        <DialogDescription>
                          Count the actual cash in the drawer and enter the amount
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm mb-2">
                            <span>Expected Cash:</span>
                            <span className="font-mono font-bold">
                              ${currentDrawer.expected_cash.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        
                        <div>
                          <Label htmlFor="actual-cash">Actual Cash ($)</Label>
                          <Input
                            id="actual-cash"
                            data-testid="actual-cash-input"
                            type="number"
                            step="0.01"
                            value={actualCash}
                            onChange={(e) => setActualCash(e.target.value)}
                            placeholder="0.00"
                            className="h-12 text-lg font-mono"
                          />
                        </div>
                        
                        {actualCash && (
                          <div className="p-4 bg-muted rounded-lg">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">Difference:</span>
                              <span
                                className={`font-mono font-bold text-lg ${
                                  parseFloat(actualCash) - currentDrawer.expected_cash >= 0
                                    ? 'text-emerald-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {parseFloat(actualCash) - currentDrawer.expected_cash >= 0 ? '+' : ''}
                                ${(parseFloat(actualCash) - currentDrawer.expected_cash).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <Label htmlFor="notes">Notes (optional)</Label>
                          <Textarea
                            id="notes"
                            data-testid="close-notes-input"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any discrepancies or notes..."
                            rows={3}
                          />
                        </div>
                        
                        <Button
                          onClick={handleCloseDrawer}
                          data-testid="confirm-close-button"
                          className="w-full h-12"
                        >
                          Close Drawer
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="mb-8">
              <CardContent className="py-12 text-center text-muted-foreground">
                No cash drawer opened for today. Click "Open Cash Drawer" to start.
              </CardContent>
            </Card>
          )}

          {/* History */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Cash Drawer History</h2>
            {history.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No cash drawer history yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {history.map((drawer) => (
                  <Card key={drawer.id} data-testid={`drawer-history-${drawer.id}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-lg font-bold">{drawer.date}</div>
                          <div className="text-sm text-muted-foreground">
                            {drawer.status === 'open' ? (
                              <span className="text-emerald-600">Currently Open</span>
                            ) : (
                              <span>
                                Closed at {new Date(drawer.closed_at).toLocaleTimeString()} by{' '}
                                {drawer.closed_by}
                              </span>
                            )}
                          </div>
                        </div>
                        {drawer.status === 'closed' && (
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              {drawer.difference >= 0 ? (
                                <TrendingUp className="w-5 h-5 text-emerald-600" />
                              ) : (
                                <TrendingDown className="w-5 h-5 text-red-600" />
                              )}
                              <span
                                className={`text-xl font-bold font-mono ${
                                  drawer.difference >= 0 ? 'text-emerald-600' : 'text-red-600'
                                }`}
                              >
                                {drawer.difference >= 0 ? '+' : ''}${drawer.difference.toFixed(2)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">Difference</div>
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Opening</div>
                          <div className="font-mono font-semibold">
                            ${drawer.opening_balance.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Expected</div>
                          <div className="font-mono font-semibold">
                            ${drawer.expected_cash.toFixed(2)}
                          </div>
                        </div>
                        {drawer.status === 'closed' && (
                          <div>
                            <div className="text-muted-foreground">Actual</div>
                            <div className="font-mono font-semibold">
                              ${drawer.actual_cash.toFixed(2)}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {drawer.notes && (
                        <div className="mt-4 p-3 bg-muted rounded text-sm">
                          <div className="font-semibold mb-1">Notes:</div>
                          <div>{drawer.notes}</div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashDrawer;
