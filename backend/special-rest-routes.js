const passwordEncryptor = require('./passwordEncryptor');
const acl = require('./acl');

module.exports = function (app, runQuery, db)
{
	app.get
	(
		"/api/my-orders",
		( req, res ) =>
		{
			let userId = req.session.user?.id;
			runQuery( 'my-orders', req, res, { customerId: userId },
				`SELECT id, date, grandTotal FROM orderGrandTotals WHERE customerId = :customerId`
			);
		}
	);


	app.get
	(
		'/api/my-order-details/:id',
		( req, res ) =>
		{
			let userId = req.session.user?.id;
			runQuery( 'my-order-details', req, res, { customerId: userId, ...req.params },
				`SELECT id, name, price, quantity, total FROM orderDetails WHERE customerId = :customerId AND id = :id`
			);
		}
	);


	// Route for receiving new orders
	app.post
	(
		"/api/new-order",
		( req, res ) =>
		{
			// Check that the current user has the right to create new orders
			if ( !acl( "new-order", req ) )
			{
				res.status( 405 );
				res.json( { error: "Not allowed!" } );
				return;
			}

			if ( !( req.body instanceof Array ) || req.body.length == 0 )
			{
				res.json( { error: "Received empty order!" } );
				return;
			}

			// Get user id from session
			let userId = req.session.user?.id;
			let lOrderId = -1;
			let result;

			try
			{
				// Add single order row to db
				let lSql = "";
				lSql += "INSERT INTO orders ( customerId )";//, date
				lSql += " VALUES ( :customerId )";// ${ customerId }, '${ lTimeStr }'
				const lPrepped1 = db.prepare( lSql );

				lSql = "";
				lSql += `INSERT INTO ordersXproducts ( orderId, ${ Object.keys( req.body[ 0 ] ) }, price )`;
				lSql += " VALUES\n( :orderId, :productId, :quantity, ( SELECT price FROM products WHERE id = :productId ) )";
				const lPrepped2 = db.prepare( lSql );

				db.prepare( "BEGIN" ).run();

				result = lPrepped1.run( { customerId : userId } );
				lOrderId = result.lastInsertRowid;

				//result = lPrepped2.run( { id : lOrderId, values : req.body } );
				for ( let r of req.body )
				{
					let lOrderDetailsRow = { orderId : lOrderId, ...r };
					result = lPrepped2.run( lOrderDetailsRow );
				}

				result = db.prepare( "COMMIT" ).run();
			}
			catch ( e )
			{
				result = { error: e + '' };
				console.log( e );
			}
			finally
			{
				if (db.inTransaction) db.prepare( "ROLLBACK" ).run();
			}

			// Prep a respone to HTTP client
			res.json( { status : "Order was accepted.", lastInsertRowid : lOrderId } );
		}
	);


  function editMyUserInfo(req, res) {

    delete req.body.userRole;

    let userId = req.session.user?.id;

    let queryParameters = { ...req.body, id: userId };

    if (queryParameters.password) {
      queryParameters.password = passwordEncryptor(queryParameters.password);
    }

    // If you knew about this route
    // you could elevated your userRole directly because it lacked
    delete req.body.userRole;

    runQuery('edit-my-user-info', req, res, queryParameters, `
        UPDATE customers
        SET ${Object.keys(req.body).map(x => x + ' = :' + x)}
        WHERE id = :id
    `);

    let stmt = db.prepare('SELECT * FROM customers WHERE id = :id');
    let updatedUserInfo = stmt.all({ id: queryParameters.id })[0];
    delete updatedUserInfo.password;
    req.session.user = updatedUserInfo;
  }
  app.put('/api/edit-my-user-info', editMyUserInfo);
  app.patch('/api/edit-my-user-info', editMyUserInfo);

}
