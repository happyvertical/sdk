smrt inbox
centralised inbox for incoming messsages from the outside world
could come from any source, email, sms, fax, vmb
could come in any form
  - ai will use what it is and where it comes from, plus any provided context to figure out what to do with it
  - use smrt object memory to make future receipt from sources, with context etc more efficient
start with email, using @have/email (in development)
sms will be forthcoming
config should have 
  - a description of what things could be
  - what to watch for and what to do when it's found

classification
  - we'll set categories, tags, topics
  - agents will have 'interests' and watch for things added to those 
  

do modules 
 have a method that returns the type of thing they're interested in (could this just be tags, categories)


config example

{
  inbox: {

  }

}
