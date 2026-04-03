import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { categoryAPI, productAPI, restaurantAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Layers, Package, GripVertical } from 'lucide-react';

const getCurrencySymbol = (c) => ({ GBP: '\u00a3', USD: '$', EUR: '\u20ac', INR: '\u20b9' }[c] || c || '\u00a3');

export default function MenuManagement() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('GBP');
  const [selectedCat, setSelectedCat] = useState('all');

  // Dialogs
  const [catDialog, setCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  const [prodDialog, setProdDialog] = useState(false);
  const [editingProd, setEditingProd] = useState(null);
  const [prodForm, setProdForm] = useState({ name: '', category_id: '', price: '', image_url: '', in_stock: true });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [cats, prods, rest] = await Promise.all([
        categoryAPI.getAll(),
        productAPI.getAll(),
        restaurantAPI.getMy().catch(() => null),
      ]);
      setCategories(cats);
      setProducts(prods);
      if (rest?.currency) setCurrency(rest.currency);
    } catch { toast.error('Failed to load menu data'); }
  };

  // --- Category CRUD ---
  const openCatDialog = (cat = null) => {
    setEditingCat(cat);
    setCatForm(cat ? { name: cat.name, description: cat.description || '' } : { name: '', description: '' });
    setCatDialog(true);
  };

  const saveCat = async (e) => {
    e.preventDefault();
    try {
      if (editingCat) { await categoryAPI.update(editingCat.id, catForm); toast.success('Category updated'); }
      else { await categoryAPI.create(catForm); toast.success('Category created'); }
      setCatDialog(false);
      loadAll();
    } catch { toast.error('Failed to save category'); }
  };

  const deleteCat = async (id) => {
    if (!window.confirm('Delete this category and all its products?')) return;
    try { await categoryAPI.delete(id); toast.success('Category deleted'); loadAll(); }
    catch { toast.error('Failed to delete'); }
  };

  // --- Product CRUD ---
  const openProdDialog = (prod = null) => {
    setEditingProd(prod);
    setProdForm(prod
      ? { name: prod.name, category_id: prod.category_id, price: String(prod.price), image_url: prod.image_url || '', in_stock: prod.in_stock }
      : { name: '', category_id: selectedCat !== 'all' ? selectedCat : '', price: '', image_url: '', in_stock: true }
    );
    setProdDialog(true);
  };

  const saveProd = async (e) => {
    e.preventDefault();
    try {
      const data = { ...prodForm, price: parseFloat(prodForm.price) };
      if (editingProd) { await productAPI.update(editingProd.id, data); toast.success('Product updated'); }
      else { await productAPI.create(data); toast.success('Product created'); }
      setProdDialog(false);
      loadAll();
    } catch { toast.error('Failed to save product'); }
  };

  const deleteProd = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try { await productAPI.delete(id); toast.success('Deleted'); loadAll(); }
    catch { toast.error('Failed to delete'); }
  };

  const filteredProducts = selectedCat === 'all' ? products : products.filter(p => p.category_id === selectedCat);
  const sym = getCurrencySymbol(currency);

  return (
    <div className="flex flex-col md:flex-row min-h-screen" data-testid="menu-management-page">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col md:flex-row">

        {/* Category Sidebar */}
        <div className="w-full md:w-64 lg:w-72 bg-muted/40 border-b md:border-b-0 md:border-r p-4 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Categories
            </h2>
            <Button size="sm" variant="ghost" onClick={() => openCatDialog()} data-testid="add-category-button">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-1">
            <button
              data-testid="cat-filter-all"
              onClick={() => setSelectedCat('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCat === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              All Products ({products.length})
            </button>
            {categories.map(cat => {
              const count = products.filter(p => p.category_id === cat.id).length;
              return (
                <div key={cat.id} className="group flex items-center">
                  <button
                    data-testid={`cat-filter-${cat.id}`}
                    onClick={() => setSelectedCat(cat.id)}
                    className={`flex-1 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedCat === cat.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                  <div className="hidden group-hover:flex items-center gap-0.5 pr-1">
                    <button onClick={() => openCatDialog(cat)} className="p-1 rounded hover:bg-muted" data-testid={`edit-category-${cat.id}`}>
                      <Edit className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <button onClick={() => deleteCat(cat.id)} className="p-1 rounded hover:bg-muted" data-testid={`delete-category-${cat.id}`}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="menu-title">Menu Management</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedCat === 'all' ? 'All products' : categories.find(c => c.id === selectedCat)?.name || 'Products'}
                {' '}&mdash; {filteredProducts.length} items
              </p>
            </div>
            <Button onClick={() => openProdDialog()} data-testid="add-product-button">
              <Plus className="w-4 h-4 mr-2" /> Add Product
            </Button>
          </div>

          {filteredProducts.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No products yet</p>
                <p className="text-sm mt-1">Add your first product to get started</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <Card key={product.id} data-testid={`product-item-${product.id}`} className="group overflow-hidden">
                  {product.image_url && (
                    <img src={product.image_url} alt={product.name} className="w-full h-32 object-cover" />
                  )}
                  <CardContent className={`${product.image_url ? 'p-3' : 'p-4'}`}>
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.category_name}</p>
                      </div>
                      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openProdDialog(product)} className="p-1 rounded hover:bg-muted" data-testid={`edit-product-${product.id}`}>
                          <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteProd(product.id)} className="p-1 rounded hover:bg-muted" data-testid={`delete-product-${product.id}`}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-lg font-bold font-mono text-emerald-600">{sym}{product.price.toFixed(2)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        product.in_stock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {product.in_stock ? 'In Stock' : 'Out'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Edit Category' : 'New Category'}</DialogTitle>
            <DialogDescription>{editingCat ? 'Update category details' : 'Create a new menu category'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCat} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input data-testid="category-name-input" value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} required />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea data-testid="category-description-input" value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" data-testid="category-submit-button">{editingCat ? 'Update' : 'Create'}</Button>
              <Button type="button" variant="outline" onClick={() => setCatDialog(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog open={prodDialog} onOpenChange={setProdDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProd ? 'Edit Product' : 'New Product'}</DialogTitle>
            <DialogDescription>{editingProd ? 'Update product details' : 'Add a new menu item'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveProd} className="space-y-4">
            <div>
              <Label>Product Name</Label>
              <Input data-testid="product-name-input" value={prodForm.name} onChange={e => setProdForm({ ...prodForm, name: e.target.value })} required />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={prodForm.category_id} onValueChange={v => setProdForm({ ...prodForm, category_id: v })} required>
                <SelectTrigger data-testid="product-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Price ({sym})</Label>
              <Input data-testid="product-price-input" type="number" step="0.01" value={prodForm.price} onChange={e => setProdForm({ ...prodForm, price: e.target.value })} required />
            </div>
            <div>
              <Label>Image URL (optional)</Label>
              <Input data-testid="product-image-input" value={prodForm.image_url} onChange={e => setProdForm({ ...prodForm, image_url: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="in_stock" data-testid="product-stock-checkbox" checked={prodForm.in_stock} onChange={e => setProdForm({ ...prodForm, in_stock: e.target.checked })} className="w-4 h-4" />
              <Label htmlFor="in_stock" className="cursor-pointer">In Stock</Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" data-testid="product-submit-button">{editingProd ? 'Update' : 'Create'}</Button>
              <Button type="button" variant="outline" onClick={() => setProdDialog(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
