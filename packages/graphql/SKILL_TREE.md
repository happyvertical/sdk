flowchart LR

subgraph 0["src"]
1["client.ts"]
2["errors.ts"]
3["types.ts"]
4["factory.ts"]
5["index.ts"]
end
1-->2
1-->3
2-->3
4-->1
4-->2
4-->3
5-->1
5-->2
5-->4
5-->3
