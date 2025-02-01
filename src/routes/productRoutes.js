// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { upload } = require('../middleware/uploadMiddleware');
const validateRequest = require('../middleware/validateRequest');

// Определяем обязательные поля для продукта
const requiredProductFields = [
  'name',
  'description',
  'code',
  'sku',
  'price',
  'quantity'
];

router.get('/', async (req, res) => {
  await productController.getProducts(req, res);
});

// GET /api/product/list - получение списка продуктов
router.get('/list', async (req, res) => {
  console.log('List endpoint hit:', req.query);
  await productController.getProducts(req, res);
});

// GET /api/product/details/:id - получение деталей продукта
router.get('/details/:id', productController.getProductById);

// GET /api/product/search - поиск продуктов
router.get('/search', productController.searchProducts);

// POST /api/product - создание нового продукта
router.post('/', 
  upload.array('images', 10),
  validateRequest(requiredProductFields),
  productController.createProduct
);

// PUT /api/product/:id - обновление продукта
router.put('/:id', 
  upload.array('images', 10),
  validateRequest(requiredProductFields),
  productController.updateProduct
);

// DELETE /api/product/:id - удаление продукта
router.delete('/:id', productController.deleteProduct);

module.exports = router;