flowchart LR

subgraph 0["src"]
subgraph 1["adapters"]
2["crawlee.ts"]
5["dom.ts"]
6["simple.ts"]
end
subgraph 3["shared"]
4["types.ts"]
9["scraper-factory.ts"]
C["factory.ts"]
end
7["index.ts"]
8["scrapeDocument.ts"]
subgraph A["scrapers"]
B["basic.ts"]
D["tree.ts"]
end
E["scrapeIndex.ts"]
end
2-->4
5-->4
6-->4
7-->8
7-->E
7-->C
7-->9
7-->4
8-->9
8-->4
9-->B
9-->D
9-->4
B-->C
B-->4
C-->2
C-->5
C-->6
C-->4
D-->4
E-->9
E-->4
