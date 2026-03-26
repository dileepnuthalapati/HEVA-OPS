import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { tableAPI, reservationAPI, orderAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Plus, Users, Clock, Merge, Split, Trash2, 
  CalendarClock, Phone, User, CheckCircle, XCircle
} from 'lucide-react';

const TableManagement = () => {
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddTable, setShowAddTable] = useState(false);
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedTables, setSelectedTables] = useState([]);
  const [mergeMode, setMergeMode] = useState(false);
  
  const [newTable, setNewTable] = useState({ number: '', capacity: 4 });
  const [newReservation, setNewReservation] = useState({
    table_id: '',
    customer_name: '',
    customer_phone: '',
    party_size: 2,
    reservation_time: '',
    duration_minutes: 120,
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tablesData, reservationsData, ordersData] = await Promise.all([
        tableAPI.getAll(),
        reservationAPI.getAll(),
        orderAPI.getPending()
      ]);
      setTables(tablesData);
      setReservations(reservationsData);
      setPendingOrders(ordersData);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTable = async (e) => {
    e.preventDefault();
    try {
      await tableAPI.create({
        number: parseInt(newTable.number),
        capacity: parseInt(newTable.capacity)
      });
      toast.success('Table created!');
      setShowAddTable(false);
      setNewTable({ number: '', capacity: 4 });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create table');
    }
  };

  const handleDeleteTable = async (tableId) => {
    if (!window.confirm('Are you sure you want to delete this table?')) return;
    try {
      await tableAPI.delete(tableId);
      toast.success('Table deleted');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete table');
    }
  };

  const handleClearTable = async (tableId) => {
    try {
      await tableAPI.clear(tableId);
      toast.success('Table cleared');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to clear table');
    }
  };

  const handleMergeTables = async () => {
    if (selectedTables.length < 2) {
      toast.error('Select at least 2 tables to merge');
      return;
    }
    try {
      await tableAPI.merge(selectedTables);
      toast.success('Tables merged!');
      setSelectedTables([]);
      setMergeMode(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to merge tables');
    }
  };

  const handleUnmergeTables = async (tableId) => {
    try {
      await tableAPI.unmerge(tableId);
      toast.success('Tables unmerged');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to unmerge tables');
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    try {
      await reservationAPI.create(newReservation);
      toast.success('Reservation created!');
      setShowAddReservation(false);
      setNewReservation({
        table_id: '',
        customer_name: '',
        customer_phone: '',
        party_size: 2,
        reservation_time: '',
        duration_minutes: 120,
        notes: ''
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create reservation');
    }
  };

  const handleSeatReservation = async (resId) => {
    try {
      await reservationAPI.seat(resId);
      toast.success('Party seated!');
      loadData();
    } catch (error) {
      toast.error('Failed to seat reservation');
    }
  };

  const handleCancelReservation = async (resId) => {
    try {
      await reservationAPI.cancel(resId);
      toast.success('Reservation cancelled');
      loadData();
    } catch (error) {
      toast.error('Failed to cancel reservation');
    }
  };

  const toggleTableSelection = (tableId) => {
    if (selectedTables.includes(tableId)) {
      setSelectedTables(selectedTables.filter(id => id !== tableId));
    } else {
      setSelectedTables([...selectedTables, tableId]);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      case 'occupied': return 'bg-red-100 text-red-700 border-red-300';
      case 'reserved': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'merged': return 'bg-blue-100 text-blue-700 border-blue-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const todayReservations = reservations.filter(r => {
    const today = new Date().toISOString().split('T')[0];
    return r.reservation_time.startsWith(today) && ['confirmed', 'seated'].includes(r.status);
  });

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
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Table Management</h1>
              <p className="text-muted-foreground">Manage tables, reservations, and seating</p>
            </div>
            <div className="flex gap-2">
              {mergeMode ? (
                <>
                  <Button variant="outline" onClick={() => { setMergeMode(false); setSelectedTables([]); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleMergeTables} disabled={selectedTables.length < 2}>
                    <Merge className="w-4 h-4 mr-2" />
                    Merge ({selectedTables.length})
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setMergeMode(true)}>
                    <Merge className="w-4 h-4 mr-2" />
                    Merge Tables
                  </Button>
                  <Dialog open={showAddReservation} onOpenChange={setShowAddReservation}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <CalendarClock className="w-4 h-4 mr-2" />
                        New Reservation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>New Reservation</DialogTitle>
                        <DialogDescription>Book a table for a customer</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateReservation} className="space-y-4 mt-4">
                        <div>
                          <Label>Table</Label>
                          <Select
                            value={newReservation.table_id}
                            onValueChange={(v) => setNewReservation({...newReservation, table_id: v})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select table" />
                            </SelectTrigger>
                            <SelectContent>
                              {tables.filter(t => t.status === 'available').map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  Table {t.number} (Seats {t.capacity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Customer Name *</Label>
                            <Input
                              value={newReservation.customer_name}
                              onChange={(e) => setNewReservation({...newReservation, customer_name: e.target.value})}
                              required
                            />
                          </div>
                          <div>
                            <Label>Phone</Label>
                            <Input
                              value={newReservation.customer_phone}
                              onChange={(e) => setNewReservation({...newReservation, customer_phone: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Party Size</Label>
                            <Input
                              type="number"
                              min="1"
                              value={newReservation.party_size}
                              onChange={(e) => setNewReservation({...newReservation, party_size: parseInt(e.target.value)})}
                            />
                          </div>
                          <div>
                            <Label>Duration (minutes)</Label>
                            <Input
                              type="number"
                              min="30"
                              step="30"
                              value={newReservation.duration_minutes}
                              onChange={(e) => setNewReservation({...newReservation, duration_minutes: parseInt(e.target.value)})}
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Date & Time *</Label>
                          <Input
                            type="datetime-local"
                            value={newReservation.reservation_time}
                            onChange={(e) => setNewReservation({...newReservation, reservation_time: e.target.value + ':00'})}
                            required
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input
                            value={newReservation.notes}
                            onChange={(e) => setNewReservation({...newReservation, notes: e.target.value})}
                            placeholder="Birthday, allergies, etc."
                          />
                        </div>
                        <Button type="submit" className="w-full">Create Reservation</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={showAddTable} onOpenChange={setShowAddTable}>
                    <DialogTrigger asChild>
                      <Button data-testid="add-table-button">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Table
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Table</DialogTitle>
                        <DialogDescription>Create a new table for your restaurant</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateTable} className="space-y-4 mt-4">
                        <div>
                          <Label htmlFor="tableNumber">Table Number *</Label>
                          <Input
                            id="tableNumber"
                            type="number"
                            min="1"
                            value={newTable.number}
                            onChange={(e) => setNewTable({...newTable, number: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="capacity">Seating Capacity</Label>
                          <Input
                            id="capacity"
                            type="number"
                            min="1"
                            value={newTable.capacity}
                            onChange={(e) => setNewTable({...newTable, capacity: e.target.value})}
                          />
                        </div>
                        <Button type="submit" className="w-full">Create Table</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Tables</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{tables.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Available</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">
                  {tables.filter(t => t.status === 'available').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Occupied</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {tables.filter(t => t.status === 'occupied').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Today's Reservations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{todayReservations.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tables Grid */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Tables</h2>
            {tables.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No tables yet. Click "Add Table" to create your first table.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {tables.map((table) => (
                  <Card 
                    key={table.id}
                    data-testid={`table-${table.number}`}
                    className={`cursor-pointer transition-all ${
                      mergeMode && selectedTables.includes(table.id) 
                        ? 'ring-2 ring-primary' 
                        : ''
                    } ${mergeMode ? 'hover:ring-2 hover:ring-primary/50' : ''}`}
                    onClick={() => mergeMode && table.status !== 'merged' ? toggleTableSelection(table.id) : null}
                  >
                    <CardContent className="p-4 text-center">
                      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-2 border-2 ${getStatusColor(table.status)}`}>
                        <span className="text-2xl font-bold">{table.number}</span>
                      </div>
                      <div className="text-sm font-medium">{table.name}</div>
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
                        <Users className="w-3 h-3" />
                        <span>{table.capacity}</span>
                      </div>
                      <div className={`mt-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(table.status)}`}>
                        {table.status.toUpperCase()}
                      </div>
                      
                      {!mergeMode && (
                        <div className="mt-3 flex gap-1 justify-center">
                          {table.status === 'occupied' && (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleClearTable(table.id); }}>
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                          )}
                          {table.merged_with && table.merged_with.length > 0 && (
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleUnmergeTables(table.id); }}>
                              <Split className="w-3 h-3" />
                            </Button>
                          )}
                          {table.status === 'available' && (
                            <Button size="sm" variant="outline" className="text-red-500" onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.id); }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Today's Reservations */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">Today's Reservations</h2>
            {todayReservations.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No reservations for today
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {todayReservations.map((res) => {
                  const table = tables.find(t => t.id === res.table_id);
                  const resTime = new Date(res.reservation_time);
                  return (
                    <Card key={res.id} data-testid={`reservation-${res.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <Clock className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <div className="font-semibold text-lg flex items-center gap-2">
                                <User className="w-4 h-4" />
                                {res.customer_name}
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  res.status === 'seated' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {res.status.toUpperCase()}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-4">
                                <span>Table {table?.number || 'N/A'}</span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {res.party_size} guests
                                </span>
                                {res.customer_phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {res.customer_phone}
                                  </span>
                                )}
                              </div>
                              {res.notes && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Note: {res.notes}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold font-mono">
                              {resTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {res.duration_minutes} min
                            </div>
                            <div className="mt-2 flex gap-1 justify-end">
                              {res.status === 'confirmed' && (
                                <Button size="sm" onClick={() => handleSeatReservation(res.id)}>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Seat
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleCancelReservation(res.id)}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableManagement;
