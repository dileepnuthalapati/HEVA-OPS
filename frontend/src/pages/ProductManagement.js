import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { categoryAPI, productAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { LayoutDashboard, Package, FolderTree, ShoppingCart, FileText, LogOut, Wallet, Store, Plus, Edit, Trash2 } from 'lucide-react';

const Sidebar = ({ active }) => {
  const { logout } = useAuth();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/restaurants', icon: Store, label: 'Restaurants' },
    { path: '/categories', icon: FolderTree, label: 'Categories' },
    { path: '/products', icon: Package, label: 'Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/cash-drawer', icon: Wallet, label: 'Cash Drawer' },
  ];

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">HevaPOS</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin Panel</p>
      </div>
      <nav className="space-y-2">
        {menuItems.map((item) => (
          <Link key={item.path} to={item.path} className={`sidebar-link ${active === item.path ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Button variant="outline" className="w-full justify-start" onClick={logout}>
          <LogOut className="w-5 h-5 mr-3" />
          Logout
        </Button>
      </div>
    </div>
  );
};

const ProductManagement = () => {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    price: '',
    image_url: '',
    in_stock: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prods, cats] = await Promise.all([productAPI.getAll(), categoryAPI.getAll()]);
      setProducts(prods);
      setCategories(cats);
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        price: parseFloat(formData.price),
      };

      if (editingProduct) {
        await productAPI.update(editingProduct.id, data);
        toast.success('Product updated successfully');
      } else {
        await productAPI.create(data);
        toast.success('Product created successfully');
      }

      setOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', category_id: '', price: '', image_url: '', in_stock: true });
      loadData();
    } catch (error) {
      toast.error('Failed to save product');
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category_id: product.category_id,
      price: product.price.toString(),
      image_url: product.image_url || '',
      in_stock: product.in_stock,
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;

    try {
      await productAPI.delete(id);
      toast.success('Product deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  return (
    <div className="flex">
      <Sidebar active={location.pathname} />
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Products</h1>
              <p className="text-muted-foreground">Manage your restaurant menu items</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="add-product-button"
                  onClick={() => {
                    setEditingProduct(null);
                    setFormData({ name: '', category_id: '', price: '', image_url: '', in_stock: true });
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                  <DialogDescription>
                    {editingProduct ? 'Update product details' : 'Create a new product for your menu'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Product Name</Label>
                    <Input
                      id="name"
                      data-testid="product-name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category_id}
                      onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                      required
                    >
                      <SelectTrigger data-testid="product-category-select">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="price">Price ($)</Label>
                    <Input
                      id="price"
                      data-testid="product-price-input"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="image_url">Image URL (optional)</Label>
                    <Input
                      id="image_url"
                      data-testid="product-image-input"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="in_stock"
                      data-testid="product-stock-checkbox"
                      checked={formData.in_stock}
                      onChange={(e) => setFormData({ ...formData, in_stock: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="in_stock" className="cursor-pointer">
                      In Stock
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" data-testid="product-submit-button" className="flex-1">
                      {editingProduct ? 'Update' : 'Create'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        setEditingProduct(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {products.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No products yet. Click "Add Product" to create your first menu item.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <Card key={product.id} data-testid={`product-item-${product.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-lg">{product.name}</div>
                        <div className="text-sm text-muted-foreground font-normal">
                          {product.category_name}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`edit-product-${product.id}`}
                          onClick={() => handleEdit(product)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`delete-product-${product.id}`}
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-40 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold font-mono text-emerald-600">
                          ${product.price.toFixed(2)}
                        </div>
                        <div
                          className={`text-sm px-3 py-1 rounded-full ${
                            product.in_stock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {product.in_stock ? 'In Stock' : 'Out of Stock'}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductManagement;