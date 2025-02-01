// src/controllers/supplierController.js
const db = require('../config/database');

const supplierController = {

  // Получение всех поставщиков (с поиском и пагинацией в оригинальном коде был метод getAllSuppliers)
  getSuppliers: async (req, res) => {
    try {
      // Если вам нужен "расширенный" метод getAllSuppliers, замените ниже на тот функционал
      const query = `
        SELECT * 
        FROM suppliers 
        ORDER BY created_at DESC
      `;

      const [suppliers] = await db.execute(query);

      res.json({
        success: true,
        data: suppliers
      });

    } catch (error) {
      console.error('Error fetching suppliers:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при получении списка поставщиков: ${error.message}`
      });
    }
  },

  // Создание поставщика
  createSupplier: async (req, res) => {
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

      // Проверка обязательных полей
      if (!name || !email || !phone_number || !address) {
        return res.status(400).json({
          success: false,
          error: 'Необходимо указать поля: name, email, phone_number, address'
        });
      }

      // Проверка комплектности банковских реквизитов
      if (bank_bik || iik || kbe) {
        if (!bank_name || !bank_bik || !iik || !kbe) {
          return res.status(400).json({
            success: false,
            error: 'При указании части банковских реквизитов необходимо заполнить и bank_name, и bank_bik, и iik, и kbe'
          });
        }
      }

      const query = `
        INSERT INTO suppliers (
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
        message: 'Поставщик успешно создан',
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
      console.error('Error creating supplier:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при создании поставщика: ${error.message}`
      });
    }
  },

  // Получение поставщика по ID
  getSupplierById: async (req, res) => {
    try {
      const { id } = req.params;
      const query = `
        SELECT * 
        FROM suppliers 
        WHERE id = ?
      `;
      const [suppliers] = await db.execute(query, [id]);

      if (suppliers.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Поставщик не найден'
        });
      }

      res.json({
        success: true,
        data: suppliers[0]
      });
    } catch (error) {
      console.error('Error fetching supplier:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при получении данных поставщика: ${error.message}`
      });
    }
  },

  // Обновление поставщика
  updateSupplier: async (req, res) => {
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
        UPDATE suppliers
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
          error: 'Поставщик не найден'
        });
      }

      res.json({
        success: true,
        message: 'Данные поставщика обновлены',
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
      console.error('Error updating supplier:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при обновлении данных поставщика: ${error.message}`
      });
    }
  },

  // Удаление поставщика
  deleteSupplier: async (req, res) => {
    try {
      const { id } = req.params;
      const query = `
        DELETE FROM suppliers 
        WHERE id = ?
      `;
      const [result] = await db.execute(query, [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Поставщик не найден'
        });
      }

      res.json({
        success: true,
        message: 'Поставщик успешно удален'
      });
    } catch (error) {
      console.error('Error deleting supplier:', error);
      res.status(500).json({
        success: false,
        error: `Произошла ошибка при удалении поставщика: ${error.message}`
      });
    }
  }
};

module.exports = supplierController;
