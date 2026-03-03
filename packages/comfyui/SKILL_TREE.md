flowchart LR

subgraph 0["src"]
1["client.ts"]
2["types.ts"]
3["index.ts"]
end
1-->2
3-->1
3-->2
