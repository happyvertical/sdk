flowchart LR

subgraph 0["src"]
1["document.ts"]
2["types.ts"]
3["factory.ts"]
subgraph 4["processors"]
5["pdf.ts"]
end
6["utils.ts"]
7["index.ts"]
end
1-->2
3-->5
3-->2
5-->1
5-->2
5-->6
7-->1
7-->3
7-->5
7-->2
7-->6
