import re

import spacy

nlp = spacy.load("en_core_sci_md")

import pandas as pd

columns = pd.read_csv("./datasets/updated_training_data.csv").columns[1:]

new_columns = [" ".join(re.split("_", column)) for column in columns]

similarity_scores = {}

def create_vector_based_on_similar_word(input_text):
    doc = nlp(input_text)

    for column in new_columns:
        column_text = nlp(column)
        similarity_score = doc.similarity(column_text)
        similarity_scores[column] = similarity_score

    threshold = 0.6
    vector = [1 if similarity_scores[column] >= threshold else 0 for column in new_columns]
    return vector