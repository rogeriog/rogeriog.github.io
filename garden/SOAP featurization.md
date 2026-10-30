---
title: "SOAP featurization"
author: "rogeriog"
date: 2022-12-17
categories:
- Machine Learning
- Featurization
- SOAP
---

<iframe width="560" height="315" src="https://www.youtube.com/embed/lIIUq4Ogkcc" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

28:57 SOAP.

<iframe width="560" height="315" src="https://www.youtube.com/embed/7mMvDsMcaWY" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

Her videos are very important to undersatnad featurization.

I think i should try to use the soap in similar structures and see if I can detect similar motifs in different structures using distance, and varying cutoff.
Then generalize soap for all elements and test a bunch of them. 
With the flattened soap, I can use DBSCAN to group similar structures.
In the end i will have for the OFM matrix, a list of clusterings from 1 to maybe 70 types of clustering associated with each structure. This will be transformed in a hotencode, 1 to 70 columns with 1 in the right correspondent. This will be appended to the featurized dataframe and will be predicted by megnet, this way megnet will be predicting the chemical subgroup detected with the OFM matrix.
The same will be done for the SOAP featurizer, but in this case we will vary the cutoff and have probably SOAP enconding for 2 Angs, 4 Angs and 6 Angs, each one with all its corresponding cluster encodings. It is important to preserve chemical interpretability to find the center structure of each clustering that can be traced back to the corresponding chemical environment.


Maybe just a descriptor of every site and check each site including it as a feature. 

To install SOAP
``` 
 conda install ase
 conda install dscribe
```
