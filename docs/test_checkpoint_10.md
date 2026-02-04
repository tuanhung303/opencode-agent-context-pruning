# Test Checkpoint 10

## Status Summary (Tests 1-10)

| Test | Description                         | Status  |
| ---- | ----------------------------------- | ------- |
| t1   | Basic Discard - Tool Hash           | ✅ PASS |
| t2   | Basic Discard - Message Hash        | PENDING |
| t3   | Mixed Discard - Tool + Message Hash | PENDING |
| t4   | Distill Tool Output                 | PENDING |
| t5   | Distill Message Hash                | PENDING |
| t6   | Mixed Distill - Tool + Message Hash | PENDING |
| t7   | Symmetric Restore - Tool Hash       | PENDING |
| t8   | Symmetric Restore - Message Hash    | PENDING |
| t9   | Bulk Operations - [tools]           | ✅ PASS |
| t10  | Bulk Operations - [messages]        | PENDING |

## Hash Registry (Batch 1)

| Test ID | Tool | Params       | Hash   | Used In         |
| ------- | ---- | ------------ | ------ | --------------- |
| t1      | read | package.json | 825138 | discard         |
| t4      | glob | \*.ts        | 574e77 | distill         |
| t9      | -    | bulk [tools] | -      | discard 5 items |

## Key Findings

1. Tool hash discard working correctly (t1)
2. Bulk [tools] operation successfully pruned 5 manual entries
3. File operations generate consistent hashes

## Next Batch

- Complete t2-t8, t10
- Begin auto-supersede tests (t15-t22)
