# ==========================================
# DAWAMIND AI MEDICINE REMINDER SYSTEM
# Demonstrates Python + Artificial Intelligence
# ==========================================

print("DAWAMIND AI SYSTEM")

# ------------------------------------------
# 1. DATA TYPES
# ------------------------------------------
patient_name = "John"
age = 45
medicine = "Paracetamol"
time_to_take = "08:00 AM"
missed_dose = False

print("\nPatient:", patient_name)
print("Medicine:", medicine)

# ------------------------------------------
# 2. CONTROL STRUCTURES
# ------------------------------------------
print("\nChecking Medicine Status")

if missed_dose:
    print("Reminder: Patient missed dose!")
else:
    print("Dose taken successfully")

print("\nDaily Reminder Loop")

for i in range(3):
    print("Reminder", i+1, ": Take your medicine")

# ------------------------------------------
# 3. FUNCTIONS
# ------------------------------------------
def send_reminder(name, drug):
    print("Reminder sent to", name, "to take", drug)

send_reminder(patient_name, medicine)

# ------------------------------------------
# 4. OBJECT ORIENTED PROGRAMMING
# ------------------------------------------
class Patient:

    def _init_(self, name, drug):
        self.name = name
        self.drug = drug

    def remind(self):
        print(self.name, "please take your", self.drug)

print("\nOOP Example")

# OOP
class Patient:
    def __init__(self, name, drug):  # make sure __init__ accepts arguments
        self.name = name
        self.drug = drug

    def remind(self):
        print(self.name, "please take your", self.drug)

p1 = Patient("Alice", "Amoxicillin")
p1.remind()

# ------------------------------------------
# 5. INTELLIGENT AGENT
# ------------------------------------------
class ReminderAgent:

    def perceive(self, missed):
        return missed

    def act(self, missed):
        if missed:
            print("Agent Action: Send urgent reminder!")
        else:
            print("Agent Action: Patient compliant")

print("\nAgent Simulation")

agent = ReminderAgent()
status = agent.perceive(True)
agent.act(status)

# ------------------------------------------
# 6. PROPOSITIONAL LOGIC
# ------------------------------------------
print("\nPropositional Logic Example")

P = True  # patient took medicine
Q = False # patient feels better

print("P AND Q:", P and Q)
print("P OR Q:", P or Q)
print("NOT P:", not P)

# ------------------------------------------
# 7. SCIENTIFIC MODULE (NUMPY)
# ------------------------------------------
import numpy as np

data = np.array([1,2,3,4,5])
print("\nAverage doses taken:", np.mean(data))

# ------------------------------------------
# 8. MACHINE LEARNING DATASET
# ------------------------------------------
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.naive_bayes import GaussianNB

# Example dataset
# Age, doses missed
X = [[25,1],[30,0],[45,3],[50,4],[23,0],[40,2]]
y = [0,0,1,1,0,1]  
# 0 = compliant
# 1 = likely to miss medication

X_train, X_test, y_train, y_test = train_test_split(X,y,test_size=0.3)

# ------------------------------------------
# 9. K NEAREST NEIGHBOURS
# ------------------------------------------
print("\nKNN Model")

knn = KNeighborsClassifier(n_neighbors=3)
knn.fit(X_train,y_train)

prediction = knn.predict([[35,2]])
print("KNN Prediction (miss risk):", prediction)

# ------------------------------------------
# 10. NAIVE BAYES
# ------------------------------------------
print("\nNaive Bayes Model")

nb = GaussianNB()
nb.fit(X_train,y_train)

prediction_nb = nb.predict([[35,2]])
print("Naive Bayes Prediction:", prediction_nb)

# ------------------------------------------
# 11. AI APPLICATION
# ------------------------------------------
print("\nAI APPLICATION")
print("This system predicts if a patient may miss medication and sends reminders.")

print("\nProgram Finished Successfully")