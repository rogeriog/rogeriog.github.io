---
title: "MODNet"
author: "rogeriog"
date: 2022-12-17
categories:
- Machine Learning
- MODNet
---

All-round framework?
Feed forward neural network? info goes one layer after the other

What does selection of meaningful features mean?
Joint-learning.

What are graph network models?
Joint learning vs single target learning. -- it seems joint learning predicts multiple properties at once, and it improves the prediction with similar properties probably.

Read these reviews of ML in materials, butler Schmidt e noh

Different feature generation used in materials ML?

Underlying ML models:
 - Ad hoc models, case by case, specific group of materials, specific properties. Tailored descriptors, see references 5678, simpler to work case by case, better accuracy, poor transfer.
 - More general models based on graph network , raw crystal becomes a graph and then deep layer, ref 9 10 11.
 - 
 - 

Pymatgen to query
- MaterialsProject
GCNN --> MEGNet (needs to know full structure)
MODNet is flexible can use structure, but also just composition.
Matminer gives basic input data to MODNet model.
Modnet implements featurization.  receives pymatgen composition, 


Read 

Get a dataset (Matminer )
Test different models (basic models --> MEGNet -- MODNet)
Compare scores, cross validation - validation and test sets (MatBench)

1) Matminer + Scikit



- MatBench