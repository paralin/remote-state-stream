Remote State Stream
===================

Consumes `grpc-bus` and `state-stream` and `reporter` to enable a remote state stream locally.

It should:

 - Fetch latest state and tail it.
 - Fetch a state history with a given config (optionally)
 - Remember what is in the state store, and not re-fetch stuff on re-connect
 - Handle disconnections, etc.

API
===

Pass in a service handle and a state context. Exposes a Stream handle from state-stream.

Use cursors to get data. System will backfill the requested data automatically.

When done with a cursor, the remote stream instance should release the data.

Implementation
==============

The client has a series of "windows." Each window contains a start snapshot and an end snapshot. The windows are stored in an array in time-series order.

A user can request a window with a timestamp the user wants the window to cover. The client then sends a request to the server for a "bounded" history query.

The "live" window is a window of data starting at the snapshot just before the last mutation and tailing with a live query. If the live query ends, the window becomes a committed window with an end at the end bound.

To make a window we need to know the snapshot before and after the window.

Windows have the following states:

 - Pending: a window without a start/end but a middle.
 - Pulling: a window pulling data still, but begin and end bound is known.
 - Committed: all data fetched for window.
 - Live: a window with a start + no end, initial set complete, waiting for live to end.

We can have one pending window at a time.

When the state stream asks for a snapshot before:

 - Check if we have a window covering that range, if so, skip
 - Create pending window
