flowchart LR

subgraph 0["src"]
1["adapter.ts"]
2["logger.ts"]
3["signal-types.ts"]
subgraph 4["cli"]
5["claude-context.ts"]
end
6["console.ts"]
7["index.ts"]
8["sentry-adapter.ts"]
9["sentry.ts"]
A["test-logger.ts"]
end
1-->2
1-->3
6-->2
7-->1
7-->6
7-->2
7-->3
8-->3
9-->8
9-->8
A-->2
