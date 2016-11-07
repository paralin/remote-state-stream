Remote State Stream
===================

Consumes `grpc-bus` and `state-stream` and `reporter` to enable a remote state stream locally.

It should:

 - Fetch latest state and tail it.
 - Fetch a state history with a given config (optionally)
 - Remember what is in the state store, and not re-fetch stuff on re-connect
 - Handle disconnections, etc.
