# 005 Job Source Debug Agent

Status: completed

## Goal

Add a bounded debug workflow that can learn reusable target instructions when a source is not ready for normal discovery.

## What Landed

- typed source-debug runs, attempts, evidence, and instruction artifacts
- sequential phase orchestration and replay verification
- Profile entrypoint for `Debug source`
- learned instructions persisted separately from manual target config

## What It Means Now

- this is completed background
- later source-intelligence work built on this in `013`, and current runtime hardening is in `017`
