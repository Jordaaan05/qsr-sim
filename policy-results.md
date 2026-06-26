## The below table displays test information using the 3 implemented algorithms.
As can be seen, using an arrival rate of 6 / min, customer patience of 120s and a menu consisting of 3 simple items,
a large gap appears between the algorithms, with FIFO failing to serve many customers, due to smaller orders getting stuck
waiting behind larger ones. SPT (Shortest Processing Time) performs admirably due to favouring tasks that will finish sooner,
and OCA (Order-completion-aware), my custom algorithm for this case performs the best, as it prioritises orders first which have the
least number of tasks left to complete, allowing a minor edge in number of orders > 120s, and lowering the mean order time. 

┌─────────┬───────────┬────────────┬───────────┬────────┬─────────┬────────┐  
│ (index) │ completed │ meanCycleS │ maxCycleS │ served │ enraged │ balked │  
├─────────┼───────────┼────────────┼───────────┼────────┼─────────┼────────┤  
│ fifo    │ 233       │ 551.4      │ 2543      │ 5      │ 349     │ 0      │  
│ spt     │ 265       │ 355.3      │ 2548      │ 101    │ 253     │ 0      │  
│ oca     │ 270       │ 317.4      │ 2543      │ 103    │ 251     │ 0      │  
└─────────┴───────────┴────────────┴───────────┴────────┴─────────┴────────┘ 