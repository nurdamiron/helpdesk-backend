const pool = require('../config/database');

// Получить список заказов
exports.getAllOrders = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        orders.id, 
        orders.order_number, 
        customers.name AS customer_name, 
        customers.email AS customer_email, 
        customers.phone_number, 
        orders.status, 
        orders.total, 
        orders.created_at
      FROM orders
      LEFT JOIN customers ON orders.customer_id = customers.id
      ORDER BY orders.id DESC
    `);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
};

// Получить детальный заказ + items
exports.getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Шапка заказа
    const [orderRows] = await pool.query(`
      SELECT 
        orders.*, 
        customers.name AS customer_name, 
        customers.email AS customer_email, 
        customers.phone_number
      FROM orders
      LEFT JOIN customers ON orders.customer_id = customers.id
      WHERE orders.id = ?
    `, [id]);

    if (!orderRows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRows[0];

    // Позиции
    const [items] = await pool.query(`
      SELECT * 
      FROM order_items 
      WHERE order_id = ?
    `, [id]);

    // Собираем вместе
    return res.json({
      ...order,
      items,
    });
  } catch (error) {
    return next(error);
  }
};


// Создать заказ
exports.createOrder = async (req, res, next) => {
  try {
    const {
      order_number,
      customer_id, // Теперь передается ID клиента
      status,
      subtotal,
      discount,
      tax,
      shipping_cost,
      total,
      shipping_address,
      items, // массив товаров
    } = req.body;

    // Проверяем существование клиента
    const [customerCheck] = await pool.query('SELECT id FROM customers WHERE id = ?', [customer_id]);
    if (!customerCheck.length) {
      return res.status(400).json({ error: 'Customer not found' });
    }

    // Создаем заказ
    const [result] = await pool.query(`
      INSERT INTO orders (
        order_number,
        customer_id,
        status,
        subtotal,
        discount,
        tax,
        shipping_cost,
        total,
        shipping_address
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      order_number || 'NO-NUM',
      customer_id,
      status || 'pending',
      subtotal || 0,
      discount || 0,
      tax || 0,
      shipping_cost || 0,
      total || 0,
      shipping_address || '',
    ]);

    const newOrderId = result.insertId;

    // Вставляем позиции заказа
    if (Array.isArray(items)) {
      for (const item of items) {
        const quantity = item.quantity || 1;
        const unitPrice = item.unit_price || 0;
        await pool.query(`
          INSERT INTO order_items (
            order_id,
            product_name,
            description,
            quantity,
            unit_price,
            total_price
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          newOrderId,
          item.product_name || '',
          item.description || '',
          quantity,
          unitPrice,
          quantity * unitPrice,
        ]);
      }
    }

    return res.status(201).json({
      message: 'Order created successfully',
      orderId: newOrderId,
    });
  } catch (error) {
    return next(error);
  }
};


// Обновить заказ
exports.updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      status,
      total,
      shipping_address,
    } = req.body;

    // Проверка наличия
    const [check] = await pool.query('SELECT id FROM orders WHERE id = ?', [id]);
    if (!check.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await pool.query(`
      UPDATE orders
      SET
        status = COALESCE(?, status),
        total = COALESCE(?, total),
        shipping_address = COALESCE(?, shipping_address),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, total, shipping_address, id]);

    return res.json({ message: 'Order updated successfully' });
  } catch (error) {
    return next(error);
  }
};

// Удалить заказ
exports.deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Проверяем наличие
    const [check] = await pool.query('SELECT id FROM orders WHERE id = ?', [id]);
    if (!check.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Удаляем связанные строки
    await pool.query('DELETE FROM order_items WHERE order_id = ?', [id]);
    // Удаляем заказ
    await pool.query('DELETE FROM orders WHERE id = ?', [id]);

    return res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    return next(error);
  }
};
