flowchart LR

subgraph 0["src"]
1["index.ts"]
subgraph 2["shared"]
3["factory.ts"]
subgraph 4["providers"]
5["ga4.ts"]
7["plausible.ts"]
end
6["types.ts"]
end
end
1-->3
1-->6
1-->6
3-->5
3-->7
3-->6
5-->6
5-->6
7-->6
7-->6
