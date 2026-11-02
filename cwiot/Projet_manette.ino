# define ButtonA 3 //bouton A
# define ButtonB 4 //bouton B
# define ButtonC 5 //bouton C
# define ButtonD 6 //bouton D

int ancienA = HIGH; 
int ancienB = HIGH;
int ancienC = HIGH;
int ancienD = HIGH;
//bouton relâché = HIGH puisque j'ai cablé les boutons en Pull-up plutot qu'en pull-down pour limiter le nombre de cables et de résistances en utilisant la resistance pull-up interne avec INPUT_PULLUP 

void setup()
{
  Serial.begin(9600);
  pinMode(ButtonA, INPUT_PULLUP);
  pinMode(ButtonB, INPUT_PULLUP);
  pinMode(ButtonC, INPUT_PULLUP);
  pinMode(ButtonD, INPUT_PULLUP);
}

void loop()
{
  int etatA = digitalRead(ButtonA);
  if (etatA != ancienA) {
    if (etatA == LOW) {
      Serial.println("A");
    } else {
      Serial.println("a");
    }
    ancienA = etatA;
  } // Indicateur Pression / Release du bouton A (majuscule = press, minuscule = release)

  int etatB = digitalRead(ButtonB);
  if (etatB != ancienB) {
    if (etatB == LOW) {
      Serial.println("B");
    } else {
      Serial.println("b");
    }
    ancienB = etatB;
  } // Indicateur Pression / Release du bouton B (majuscule = press, minuscule = release)

  int etatC = digitalRead(ButtonC);
  if (etatC != ancienC) {
    if (etatC == LOW) {
      Serial.println("C");
    } else {
      Serial.println("c");
    }
    ancienC = etatC;
  } // Indicateur Pression / Release du bouton C (majuscule = press, minuscule = release)

  int etatD = digitalRead(ButtonD);
  if (etatD != ancienD) {
    if (etatD == LOW) {
      Serial.println("D");
    } else {
      Serial.println("d");
    }
    ancienD = etatD;
  } // Indicateur Pression / Release du bouton D (majuscule = press, minuscule = release)

  delay(5); // anti rebond
}