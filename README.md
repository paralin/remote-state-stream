Remote State Stream
===================

[![Greenkeeper badge](https://badges.greenkeeper.io/FuseRobotics/remote-state-stream.svg?token=eee3ef19ae190dfddcc9df4abf3edeaf4bc65b4184bc29db21a05df5f7b1cfd6)](https://greenkeeper.io/)

Consumes `state-stream` and `reporter` to enable a remote state stream locally.

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

Some things to do:

 - [ ] Make sure that the storage on a window marks the Subject as complete if the data is done coming through.
 - [x] Move errors into the subject as well (subjects support the concept of aborting if there's an error)
 - [x] Create a subscribe mechanism for cursors (live cursors).
 - [x] Internally use a better rxjs pattern. Use more subjects and operators, etc to manage streams of data.

Live Window Implementation
==========================

Implementing live cursors is actually a bit difficult, for one reason: we have no way of knowing if anyone is still using the cursor. Similarly, we have no way of resetting the singleton cursor instance we create, in the case we skip some data, without causing some issues.

Solution: keep a single live cursor. When we get a new live window, feed it the early bound snapshot immediately. This should not cause any issues unless the snapshot is earlier than the latest timestamp on the cursor.

In terms of observing the cursor: clients subscribe to the live cursor, get a rxjs Subscription, and should unsubscribe when possible. Also, if there's an error in the process of updating the cursor, the system will mark all the subscriptions as errored and kill the cursor.
