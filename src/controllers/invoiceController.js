const pool = require('../config/database');

const formatInvoiceResponse = (row) => ({
 id: row.id,
 invoiceNumber: row.invoice_number,
 createDate: row.date_create, 
 dueDate: row.due_date,
 sent: row.sent,
 status: row.status,
 documentType: row.document_type,
 total: row.total,
 invoiceTo: {
   name: row.client_name,
   bin: row.bin_iin
 }
});

exports.getAllInvoices = async (req, res) => {
 const [rows] = await pool.query(`
   SELECT 
     i.*,
     COALESCE(c.name, s.name) as client_name,
     COALESCE(c.bin_iin, s.bin_iin) as bin_iin
   FROM invoices i
   LEFT JOIN customers c ON i.billing_to = c.id 
   LEFT JOIN suppliers s ON i.billing_from = s.id
   ORDER BY i.date_create DESC
 `);

 return res.json(rows.map(formatInvoiceResponse));
};

exports.getInvoiceById = async (req, res) => {
 const [[invoice]] = await pool.query(`
   SELECT 
     i.*,
     c.name as customer_name, 
     c.bin_iin as customer_bin_iin,
     s.name as supplier_name, 
     s.bin_iin as supplier_bin_iin,
     c.email as customer_email,
     c.phone_number as customer_phone,
     c.address as customer_address,
     c.bank_name as customer_bank,
     c.bank_bik as customer_bik,
     c.iik as customer_iik,
     c.kbe as customer_kbe,
     c.knp as customer_knp
   FROM invoices i
   LEFT JOIN customers c ON i.billing_to = c.id
   LEFT JOIN suppliers s ON i.billing_from = s.id 
   WHERE i.id = ?
 `, [req.params.id]);

 if (!invoice) {
   return res.status(404).json({ error: 'Invoice not found' });
 }

 const [items] = await pool.query(`
   SELECT * FROM invoice_items 
   WHERE invoice_id = ?
 `, [req.params.id]);

 res.json({
   invoice: {
     id: invoice.id,
     invoiceNumber: invoice.invoice_number,
     createDate: invoice.date_create,
     dueDate: invoice.due_date,
     status: invoice.status,
     documentType: invoice.document_type,
     sent: invoice.sent,
     total: invoice.total,
     subtotal: invoice.subtotal,
     shipping: invoice.shipping,
     discount: invoice.discount,
     tax: invoice.tax,
     notes: invoice.notes
   },
   customer: {
     name: invoice.customer_name,
     bin: invoice.customer_bin_iin,
     email: invoice.customer_email,
     phone: invoice.customer_phone,
     address: invoice.customer_address,
     bankName: invoice.customer_bank,
     bik: invoice.customer_bik,
     iik: invoice.customer_iik,
     kbe: invoice.customer_kbe, 
     knp: invoice.customer_knp
   },
   items
 });
};

exports.createInvoice = async (req, res) => {
 const {
   document_type = 'invoice',
   status = 'draft',
   due_date,
   billing_from,
   billing_to,
   items = [],
   subtotal = 0,
   shipping = 0, 
   discount = 0,
   tax = 0,
   total = 0,
   notes = ''
 } = req.body;

 
 const connection = await pool.getConnection();

 try {
   await connection.beginTransaction();

   const currentDate = new Date();
   const dateStr = `${currentDate.getDate().toString().padStart(2,'0')}${(currentDate.getMonth()+1).toString().padStart(2,'0')}${currentDate.getFullYear().toString().slice(-2)}`;
   
   const [[{count}]] = await connection.query(
     'SELECT COUNT(*) as count FROM invoices WHERE DATE(date_create) = CURDATE()'
   );

   const invoice_number = `${dateStr}-${(count+1).toString().padStart(3,'0')}`;

   const [result] = await connection.query(
     'INSERT INTO invoices SET ?',
     {
       invoice_number,
       document_type,
       status,
       date_create: currentDate,
       due_date,
       billing_from,
       billing_to,
       subtotal,
       shipping,
       discount,
       tax,
       total,
       notes,
       sent: 0
     }
   );

   if (items.length) {
     await Promise.all(items.map(item =>
       connection.query(
         'INSERT INTO invoice_items SET ?',
         {
           invoice_id: result.insertId,
           title: item.title || '',
           description: item.description || '',
           service: item.service || '',
           quantity: item.quantity || 1,
           unit_price: item.unit_price || 0,
           total_price: (item.quantity || 1) * (item.unit_price || 0)
         }
       )
     ));
   }

   await connection.commit();
   res.status(201).json({
     id: result.insertId,
     invoiceNumber: invoice_number,
     message: 'Invoice created successfully'
   });

 } catch (error) {
   await connection.rollback();
   throw error;
 } finally {
   connection.release();
 }
};

exports.updateInvoice = async (req, res) => {
 const { id } = req.params;
 const { status, sent, document_type, items, ...updates } = req.body;

 const connection = await pool.getConnection();

 try {
   await connection.beginTransaction();

   const [[invoice]] = await connection.query(
     'SELECT id FROM invoices WHERE id = ?',
     [id]
   );

   if (!invoice) {
     return res.status(404).json({ error: 'Invoice not found' });
   }

   await connection.query(
     'UPDATE invoices SET ? WHERE id = ?',
     [{
       status,
       sent,
       document_type,
       ...updates,
       updated_at: new Date()
     }, id]
   );

   if (items) {
     await connection.query(
       'DELETE FROM invoice_items WHERE invoice_id = ?',
       [id]
     );
     
     await Promise.all(items.map(item =>
       connection.query(
         'INSERT INTO invoice_items SET ?',
         {
           invoice_id: id,
           title: item.title,
           description: item.description,
           service: item.service,
           quantity: item.quantity,
           unit_price: item.unit_price,
           total_price: item.quantity * item.unit_price
         }
       )
     ));
   }

   await connection.commit();
   res.json({ message: 'Invoice updated successfully' });

 } catch (error) {
   await connection.rollback(); 
   throw error;
 } finally {
   connection.release();
 }
};

exports.deleteInvoice = async (req, res) => {
 const { id } = req.params;
 const connection = await pool.getConnection();

 try {
   await connection.beginTransaction();

   const [[invoice]] = await connection.query(
     'SELECT id FROM invoices WHERE id = ?',
     [id]
   );

   if (!invoice) {
     return res.status(404).json({ error: 'Invoice not found' });
   }

   await Promise.all([
     connection.query('DELETE FROM invoice_items WHERE invoice_id = ?', [id]),
     connection.query('DELETE FROM invoices WHERE id = ?', [id])
   ]);

   await connection.commit();
   res.json({ message: 'Invoice deleted successfully' });

 } catch (error) {
   await connection.rollback();
   throw error;
 } finally {
   connection.release();
 } 
};