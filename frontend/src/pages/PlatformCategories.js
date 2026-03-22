import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Globe, FolderTree } from 'lucide-react';

// This uses the same backend /api/categories but for global platform categories
// Platform owner manages default categories that can be assigned to restaurants

const PlatformCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  // Default global categories for restaurants
  const defaultCategories = [
    { id: 'global_1', name: 'Appetizers', description: 'Starters and small plates', isDefault: true },
    { id: 'global_2', name: 'Main Course', description: 'Main dishes and entrees', isDefault: true },
    { id: 'global_3', name: 'Desserts', description: 'Sweet treats and desserts', isDefault: true },
    { id: 'global_4', name: 'Beverages', description: 'Drinks and refreshments', isDefault: true },
    { id: 'global_5', name: 'Sides', description: 'Side dishes and accompaniments', isDefault: true },
    { id: 'global_6', name: 'Specials', description: 'Daily specials and promotions', isDefault: true },
  ];

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      // For now, use default categories. Later, fetch from API
      setCategories(defaultCategories);
    } catch (error) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        // Update category
        setCategories(categories.map(c => 
          c.id === editingCategory.id 
            ? { ...c, ...formData }
            : c
        ));
        toast.success('Category updated!');
      } else {
        // Create new category
        const newCategory = {
          id: `global_${Date.now()}`,
          ...formData,
          isDefault: false
        };
        setCategories([...categories, newCategory]);
        toast.success('Category created!');
      }
      setShowAddCategory(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '' });
    } catch (error) {
      toast.error('Failed to save category');
    }
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({ name: category.name, description: category.description || '' });
    setShowAddCategory(true);
  };

  const handleDelete = (categoryId) => {
    if (!window.confirm('Remove this global category?')) return;
    setCategories(categories.filter(c => c.id !== categoryId));
    toast.success('Category removed');
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-12">Loading categories...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Global Categories</h1>
              <p className="text-muted-foreground">
                Default categories available for all restaurants during onboarding
              </p>
            </div>
            <Dialog open={showAddCategory} onOpenChange={(open) => {
              setShowAddCategory(open);
              if (!open) {
                setEditingCategory(null);
                setFormData({ name: '', description: '' });
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="add-global-category-button">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Global Category'}</DialogTitle>
                  <DialogDescription>
                    This category will be available for all restaurants
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="name">Category Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Appetizers"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of the category"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="flex-1">
                      {editingCategory ? 'Update' : 'Create'} Category
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowAddCategory(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Info Card */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-800">
                    <strong>Global categories</strong> are default templates available when onboarding new restaurants. 
                    Restaurant admins can customize their own categories based on these templates.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Categories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <Card key={category.id} data-testid={`category-${category.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderTree className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{category.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {category.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    {category.isDefault && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4 justify-end">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(category)}>
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    {!category.isDefault && (
                      <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleDelete(category.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformCategories;
