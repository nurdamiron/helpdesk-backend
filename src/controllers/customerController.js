// src/controllers/customerController.js
const db = require('../config/database');

const customerController = {

  // Получение всех клиентов с поиском и пагинацией
  getAllCustomers: async (req, res) => {
    try {
      // Простой запрос, без WHERE, LIMIT и ORDER BY
      const sql = `
        SELECT *
        FROM customers
        ORDER BY created_at DESC
      `;

      // Выполняем запрос
      const [rows] = await db.execute(sql);

      return res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      console.error('Error fetching customers:', error);
      return res.status(500).json({
        success: false,
        error: `Произошла ошибка при получении списка клиентов: ${error.message}`
      });
    }
  },

  
  // Создание клиента
  createCustomer: async (req, res) => {
    try {
      const {
        name,
        email,
        phone_number,
        address,
        company_type,
        bin_iin,
        bank_name,
        bank_bik,
        iik,
        kbe,
        knp,
        is_resident,
        additional_info
      } = req.body;

      if (!name || !email || !phone_number || !address) {
        return res.status(400).json({
          success: false,
          error: 'Необходимо указать поля: name, email, phone_number, address'
        });
      }

      if (bank_bik || iik || kbe) {
        if (!bank_name || !bank_bik || !iik || !kbe) {
          return res.status(400).json({
            success: false,
            error: 'При указании части банковских реквизитов необходимо заполнить и bank_name, и bank_bik, и iik, и kbe'
          });
        }
      }

      const query = `
        INSERT INTO customers (
          name, email, phone_number, address,
          company_type, bin_iin,
          bank_name, bank_bik, iik, kbe, knp,
          is_resident, additional_info
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await db.execute(query, [
        name, 
        email, 
        phone_number, 
        address,
        company_type || null,
        bin_iin || null,
        bank_name || null,
        bank_bik || null,
        iik || null,
        kbe || null,
        knp || null,
        is_resident !== undefined ? is_resident : true,
        additional_info ? JSON.stringify(additional_info) : null
      ]);

      res.status(201).json({
        success: true,
        message: 'Клиент успешно создан',
        data: {
          id: result.insertId,
          name,
          email,
          phone_number,
          address,
          company_type,
          bin_iin,
          bank_name,
          bank_bik,
          iik,
          kbe,
          knp,
          is_resident,
          additional_info
        }
      });
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при создании клиента: ${error.message}`
      });
    }
  },

  // Получение списка клиентов (упрощённая версия, без поиска/пагинации)
  getCustomers: async (req, res) => {
    try {
      const query = `
        SELECT * 
        FROM customers 
        ORDER BY created_at DESC
      `;
      const [customers] = await db.execute(query);

      res.json({
        success: true,
        data: customers
      });
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при получении списка клиентов: ${error.message}`
      });
    }
  },

  // Получение клиента по ID
  getCustomerById: async (req, res) => {
    try {
      const { id } = req.params;
      const query = `
        SELECT * 
        FROM customers 
        WHERE id = ?
      `;
      const [customers] = await db.execute(query, [id]);

      if (customers.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Клиент не найден'
        });
      }

      res.json({
        success: true,
        data: customers[0]
      });
    } catch (error) {
      console.error('Error fetching customer:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при получении данных клиента: ${error.message}`
      });
    }
  },

  // Обновление клиента
  updateCustomer: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        email,
        phone_number,
        address,
        company_type,
        bin_iin,
        bank_name,
        bank_bik,
        iik,
        kbe,
        knp,
        is_resident,
        additional_info
      } = req.body;

      if (!name || !email || !phone_number || !address) {
        return res.status(400).json({
          success: false,
          error: 'Необходимо указать поля: name, email, phone_number, address'
        });
      }

      const query = `
        UPDATE customers
        SET 
          name = ?,
          email = ?,
          phone_number = ?,
          address = ?,
          company_type = ?,
          bin_iin = ?,
          bank_name = ?,
          bank_bik = ?,
          iik = ?,
          kbe = ?,
          knp = ?,
          is_resident = ?,
          additional_info = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      const [result] = await db.execute(query, [
        name,
        email,
        phone_number,
        address,
        company_type || null,
        bin_iin || null,
        bank_name || null,
        bank_bik || null,
        iik || null,
        kbe || null,
        knp || null,
        is_resident !== undefined ? is_resident : true,
        additional_info ? JSON.stringify(additional_info) : null,
        id
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Клиент не найден'
        });
      }

      res.json({
        success: true,
        message: 'Данные клиента обновлены',
        data: {
          id,
          name,
          email,
          phone_number,
          address,
          company_type,
          bin_iin,
          bank_name,
          bank_bik,
          iik,
          kbe,
          knp,
          is_resident,
          additional_info
        }
      });
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при обновлении данных клиента: ${error.message}`
      });
    }
  },

  // Удаление клиента
  deleteCustomer: async (req, res) => {
    try {
      const { id } = req.params;
      const query = `
        DELETE FROM customers 
        WHERE id = ?
      `;
      const [result] = await db.execute(query, [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Клиент не найден'
        });
      }

      res.json({
        success: true,
        message: 'Клиент успешно удалён'
      });
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при удалении клиента: ${error.message}`
      });
    }
  }
};

module.exports = customerController;
