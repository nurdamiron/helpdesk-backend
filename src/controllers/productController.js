const db = require('../config/database');

// Utility functions


const formatProduct = (product) => {
  
  const safeParseJSON = (str, defaultValue = []) => {
    if (!str) return defaultValue;
    if (Array.isArray(str)) return str;
    if (typeof str === 'object') return str;
    
    try {
      return JSON.parse(str);
    } catch (e) {
      console.warn('JSON parse warning:', e.message);
      return defaultValue;
    }
  };

  const quantity = parseInt(product.quantity) || 0;
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    sub_description: product.sub_description,
    code: product.code,
    sku: product.sku,
    images: safeParseJSON(product.images, []),
    price: parseFloat(product.price) || 0,
    price_sale: product.price_sale ? parseFloat(product.price_sale) : null,
    quantity,
    available: quantity,
    taxes: product.taxes ? parseFloat(product.taxes) : null,
    category: product.category || '',
    colors: safeParseJSON(product.colors, []),
    sizes: safeParseJSON(product.sizes, []),
    tags: safeParseJSON(product.tags, []),
    gender: safeParseJSON(product.gender, []),
    new_label: safeParseJSON(product.new_label, null),
    sale_label: safeParseJSON(product.sale_label, null),
    is_published: Boolean(product.is_published),
    publish: Boolean(product.is_published) ? 'published' : 'draft',
    inventoryType: quantity <= 0 ? 'out of stock' : quantity <= 10 ? 'low stock' : 'in stock',
    createdAt: product.created_at
  };
};

const prepareProductData = (data) => ({
  name: data.name,
  description: data.description,
  sub_description: data.sub_description || null,
  code: data.code,
  sku: data.sku,
  price: parseFloat(data.price),
  price_sale: data.price_sale ? parseFloat(data.price_sale) : null,
  quantity: parseInt(data.quantity),
  taxes: data.taxes ? parseFloat(data.taxes) : null,
  images: JSON.stringify(data.images || []),
  colors: JSON.stringify(data.colors || []),
  sizes: JSON.stringify(data.sizes || []),
  tags: JSON.stringify(data.tags || []),
  gender: JSON.stringify(data.gender || []),
  category: data.category || null,
  new_label: data.new_label ? JSON.stringify(data.new_label) : null,
  sale_label: data.sale_label ? JSON.stringify(data.sale_label) : null,
  is_published: data.is_published ? 1 : 0
});

const validateProduct = (data) => {
  const required = ['name', 'description', 'code', 'sku', 'price', 'quantity'];
  const missing = required.filter(field => !data[field]);
  if (missing.length) {
    throw { 
      status: 400, 
      message: 'Missing required fields', 
      fields: missing 
    };
  }
};

// Controller
const productController = {
  async getProducts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const allowedSorts = ['created_at', 'name', 'price', 'quantity'];
      const sort = allowedSorts.includes(req.query.sort) ? req.query.sort : 'created_at';
      const order = req.query.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      const [products] = await db.query(
        `SELECT SQL_CALC_FOUND_ROWS * FROM products ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`, 
        [limit, offset]
      );

      const [[{ total }]] = await db.query('SELECT FOUND_ROWS() as total');

      res.json({
        products: products.map(formatProduct),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch products'
      });
    }
  },

  async getProductById(req, res) {
    try {
      const [products] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [req.params.id]
      );

      if (!products.length) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${req.params.id}`
        });
      }

      res.json({
        success: true,
        data: formatProduct(products[0])
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch product'
      });
    }
  },

  async createProduct(req, res) {
    try {
      validateProduct(req.body);

      const [existing] = await db.query(
        'SELECT id FROM products WHERE code = ? OR sku = ?',
        [req.body.code, req.body.sku]
      );

      if (existing.length) {
        return res.status(400).json({
          success: false,
          message: 'Product with this code or SKU already exists'
        });
      }

      const productData = prepareProductData(req.body);
      const fields = Object.keys(productData).join(', ');
      const values = Object.values(productData);
      const placeholders = values.map(() => '?').join(', ');

      const [result] = await db.query(
        `INSERT INTO products (${fields}) VALUES (${placeholders})`,
        values
      );

      const [newProduct] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({
        success: true,
        data: formatProduct(newProduct[0]),
        message: 'Product created successfully'
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to create product',
        ...(error.fields && { fields: error.fields })
      });
    }
  },

  async updateProduct(req, res) {
    try {
      validateProduct(req.body);

      const [existing] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [req.params.id]
      );

      if (!existing.length) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      const [duplicates] = await db.query(
        'SELECT id FROM products WHERE (code = ? OR sku = ?) AND id != ?',
        [req.body.code, req.body.sku, req.params.id]
      );

      if (duplicates.length) {
        return res.status(400).json({
          success: false,
          message: 'Product with this code or SKU already exists'
        });
      }

      const productData = prepareProductData(req.body);
      const setClause = Object.keys(productData)
        .map(key => `${key} = ?`)
        .join(', ');

      await db.query(
        `UPDATE products SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...Object.values(productData), req.params.id]
      );

      const [updatedProduct] = await db.query(
        'SELECT * FROM products WHERE id = ?',
        [req.params.id]
      );

      res.json({
        success: true,
        data: formatProduct(updatedProduct[0]),
        message: 'Product updated successfully'
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to update product',
        ...(error.fields && { fields: error.fields })
      });
    }
  },

  async deleteProduct(req, res) {
    try {
      const [result] = await db.query(
        'DELETE FROM products WHERE id = ?',
        [req.params.id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      res.json({
        success: true,
        id: req.params.id,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete product'
      });
    }
  },

  async searchProducts(req, res) {
    try {
      const { query } = req.query;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const searchQuery = `%${query}%`;

      const [products] = await db.query(
        `SELECT SQL_CALC_FOUND_ROWS * FROM products 
         WHERE name LIKE ? OR description LIKE ? OR code LIKE ? OR sku LIKE ?
         LIMIT ? OFFSET ?`,
        [searchQuery, searchQuery, searchQuery, searchQuery, limit, offset]
      );

      const [[{ total }]] = await db.query('SELECT FOUND_ROWS() as total');

      res.json({
        success: true,
        products: products.map(formatProduct),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to search products'
      });
    }
  }
};

module.exports = productController;