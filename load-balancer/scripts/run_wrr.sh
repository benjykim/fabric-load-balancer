#!/bin/bash

function back_ground_process () {
    beginTime=$(date +%s%N)

    node query_wrr.js

    endTime=$(date +%s%N)
    
    elapsed=`echo "($endTime - $beginTime) / 1000000" | bc` 
    elapsedSec=`echo "scale=6;$elapsed / 1000" | bc | awk '{printf "%.6f", $1}'` 
    echo TOTAL: $elapsedSec sec
}

arr=("a_worker" "b_worker" "c_worker" "d_worker" "e_worker")

for i in ${arr[@]}; do
    back_ground_process $i > ./log_${i}.txt &
done

wait 

echo "All background processes are done"