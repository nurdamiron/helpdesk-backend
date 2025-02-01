// companyController.js

const pool = require('../config/database');

const companyController = {
    getAllCompanies: async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM companies WHERE status = "active"');
            res.json(rows);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    createCompany: async (req, res) => {
        try {
            const { name, bin_iin, code } = req.body;
            
            if (!name || !bin_iin) {
                return res.status(400).json({ error: 'Name and BIN/IIN are required' });
            }

            const [existing] = await pool.query(
                'SELECT * FROM companies WHERE bin_iin = ?',
                [bin_iin]
            );

            if (existing.length > 0) {
                return res.status(400).json({ error: 'Company with this BIN/IIN already exists' });
            }

            const [result] = await pool.execute(
                'INSERT INTO companies (name, bin_iin, code, status, created_at) VALUES (?, ?, ?, "active", CURRENT_TIMESTAMP)',
                [name, bin_iin, code || bin_iin.substring(0, 6)]
            );

            res.status(201).json({ 
                id: result.insertId, 
                name, 
                bin_iin,
                code: code || bin_iin.substring(0, 6),
                status: 'active'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    checkCompanyByBin: async (req, res) => {
        try {
            const { bin } = req.params;

            if (!bin || bin.length !== 12) {
                return res.status(400).json({ 
                    error: 'Invalid BIN/IIN format' 
                });
            }

            const [companies] = await pool.query(
                'SELECT id, name, bin_iin, code, status FROM companies WHERE bin_iin = ?',
                [bin]
            );

            if (companies.length === 0) {
                return res.status(404).json({
                    exists: false,
                    message: 'Company not found'
                });
            }

            res.json({
                exists: true,
                company: companies[0]
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    searchCompanies: async (req, res) => {
        try {
            const { query } = req.query;
            
            if (!query) {
                return res.status(400).json({ error: 'Search query is required' });
            }

            const [companies] = await pool.query(
                `SELECT * FROM companies 
                 WHERE (name LIKE ? OR bin_iin LIKE ?) 
                 AND status = "active"
                 LIMIT 10`,
                [`%${query}%`, `%${query}%`]
            );

            res.json(companies);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = companyController;