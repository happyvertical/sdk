flowchart LR

subgraph 0["src"]
1["index.ts"]
subgraph 2["providers"]
3["environment-canada.ts"]
7["openweathermap.ts"]
8["openweathermap-onecall.ts"]
end
subgraph 4["shared"]
5["types.ts"]
6["utils.ts"]
end
end
1-->3
1-->7
1-->8
1-->5
1-->5
1-->6
3-->5
3-->5
3-->6
6-->5
7-->5
7-->5
7-->6
8-->5
8-->5
8-->6
