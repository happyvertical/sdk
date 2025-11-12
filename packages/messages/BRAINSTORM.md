common interface around email provider adapters
same pattern as have/sql|files|ai
accept db client options 
should be able to send and receive with mailbox
should be able to send plain text and html
should be able to send and receive encrypted
will need to be able to sync the db with the mailbox



Mailbox object
Mailbox->fetch(options);
Mailbox->send(options)
[...]


 const bob = getMailbox({ type: 'gmail'|'pop3',host,port,etc }) 
 bob.fetch()
 

