const pool = require('../config/database');

/**
 * Create a new requester or get existing one by email
 */
exports.createRequester = async (req, res) => {
  try {
    const { email, full_name, phone, student_id, faculty, preferred_contact, company_id } = req.body;
    
    if (!email || !full_name) {
      return res.status(400).json({ error: 'Email and full name are required' });
    }
    
    // Check if requester already exists with this email
    const [existingRequester] = await pool.query(
      'SELECT * FROM requesters WHERE email = ?',
      [email]
    );
    
    if (existingRequester.length > 0) {
      // Update existing requester information
      const [updateResult] = await pool.query(
        `UPDATE requesters 
         SET full_name = ?, 
             phone = ?, 
             student_id = ?, 
             faculty = ?, 
             preferred_contact = ?, 
             company_id = ?, 
             updated_at = CURRENT_TIMESTAMP
         WHERE email = ?`,
        [full_name, phone || null, student_id || null, faculty || null, 
         preferred_contact || 'email', company_id || null, email]
      );
      
      return res.status(200).json({ 
        message: 'Requester found and updated',
        requester: existingRequester[0]
      });
    }
    
    // Create new requester
    const [insertResult] = await pool.query(
      `INSERT INTO requesters 
       (email, full_name, phone, student_id, faculty, preferred_contact, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [email, full_name, phone || null, student_id || null, faculty || null, 
       preferred_contact || 'email', company_id || null]
    );
    
    const requesterId = insertResult.insertId;
    
    // Get the newly created requester
    const [newRequester] = await pool.query(
      'SELECT * FROM requesters WHERE id = ?',
      [requesterId]
    );
    
    return res.status(201).json({
      message: 'Requester created successfully',
      requester: newRequester[0]
    });
  } catch (error) {
    console.error('Error in createRequester:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Get requester by ID
 */
exports.getRequesterById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.query(
      'SELECT * FROM requesters WHERE id = ?',
      [id]
    );
    
    if (!rows.length) {
      return res.status(404).json({ error: 'Requester not found' });
    }
    
    return res.json({ requester: rows[0] });
  } catch (error) {
    console.error('Error in getRequesterById:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Get all requesters with optional filtering
 */
exports.getRequesters = async (req, res) => {
  try {
    let query = 'SELECT * FROM requesters';
    const params = [];
    
    // Add filters if provided
    if (req.query.email) {
      query += ' WHERE email LIKE ?';
      params.push(`%${req.query.email}%`);
    }
    
    // Add sorting
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.query(query, params);
    
    return res.json({ requesters: rows });
  } catch (error) {
    console.error('Error in getRequesters:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};