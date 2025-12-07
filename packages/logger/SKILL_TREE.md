flowchart LR

subgraph 0["src"]
1["adapter.ts"]
2["logger.ts"]
3["signal-types.ts"]
4["console.ts"]
5["index.ts"]
6["test-logger.ts"]
end
1-->2
1-->3
4-->2
5-->1
5-->4
5-->2
5-->3
6-->2
